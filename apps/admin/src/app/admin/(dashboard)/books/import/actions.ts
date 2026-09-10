"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { removeUploaded, type UploadedFile } from "@/lib/admin-storage";
import { blockedAuthorReason } from "@ttokttok/shared/book-rights";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchEpub } from '@ttokttok/content/wikisource';
import { assertClean, readEpubMetadata, toPageTitle } from '@ttokttok/shared/wikisource';

/**
 * @file 위키문헌 EPUB 임포트 (PRD §5.10, §5.11).
 *
 * 관리자가 문서 주소·저자·카테고리를 넣으면 본문을 받아 정리해 올리고
 * `books` 행을 **바로 만든다**. 그리고 수정 화면으로 보낸다 —
 * 소개·인용구·권리 근거는 편집 판단이라 기계가 채울 수 없고, 저자는
 * ws-export가 `dc:creator`를 아예 넣지 않아 원천이 없다 (§11-49).
 *
 * 제목은 `dc:title`로 채운다. 위키문헌 문서 제목에는 「진달래꽃 (시집)」
 * 처럼 판본 괄호가 붙는 경우가 있고 **그걸 자동으로 떼지 않는다** —
 * 규칙화하면 정상 제목의 괄호까지 먹는다. 수정 화면에서 사람이 고친다.
 */

const str = (fd: FormData, key: string) =>
  String(fd.get(key) ?? "").trim() || null;

/**
 * 오류를 안고 온 화면으로 되돌린다.
 *
 * **화살표 함수가 아니라 함수 선언이어야 한다.** 타입스크립트의 제어 흐름
 * 분석은 `never`를 돌려주는 호출 뒤를 도달 불가로 보는데, 그 판단은 호출
 * 대상이 함수 선언(또는 명시적 타입을 가진 const 변수)일 때만 적용된다.
 * `const back = (m: string): never => …` 로 쓰면 아래에서 `source`가
 * `string | null`로 남아 타입 오류가 난다.
 *
 * `from`은 두 값만 뜻이 있고 나머지는 임포트 화면으로 간다. **경로를
 * 폼에서 받지 않는 이유가 이것이다** — 숨은 필드는 사용자가 고칠 수 있고,
 * 받은 경로로 리다이렉트하면 열린 리다이렉트가 된다.
 */
function back(message: string, from: string | null): never {
  const path =
    from === "catalogue" ? "/admin/books/wikisource" : "/admin/books/import";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function importFromWikisource(formData: FormData) {
  await requireAdmin();

  const source = str(formData, "source");
  const author = str(formData, "author");
  const category = str(formData, "category");
  // 오류가 났을 때 어느 화면으로 되돌릴지. 값은 아래 back이 화이트리스트로 거른다.
  const from = str(formData, "from");

  if (!source || !author || !category) {
    back("문서 주소·저자·카테고리는 모두 필요합니다.", from);
  }

  // 명단은 src/lib/book-rights.ts 하나다 — 목록 화면도 같은 것을 본다.
  const blocked = blockedAuthorReason(author);
  if (blocked) {
    back(
      `등록할 수 없는 저작자입니다: 「${author}」 — ${blocked} (PRD §5.11 등록 금지 목록).`,
      from,
    );
  }

  // redirect()는 예외를 던져 동작한다. try 안에서 부르면 그 catch가
  // 리다이렉트를 삼키므로, 던질 수 있는 호출만 좁게 감싸고 결과를 밖에서 쓴다.
  let pageTitle: string;
  try {
    pageTitle = toPageTitle(source);
  } catch (err) {
    back(err instanceof Error ? err.message : "문서 주소를 읽을 수 없습니다.", from);
  }

  const db = await createClient();

  // 4MB를 받기 전에 먼저 확인한다. unique 인덱스는 최종 방어선으로 남긴다.
  const { data: existing, error: existingErr } = await db
    .from("books")
    .select("id")
    .eq("source_ref", pageTitle)
    .maybeSingle();

  if (existingErr) {
    // data만 보고 넘어가면 조회 실패가 "중복 아님"으로 읽혀, 4MB짜리
    // fetch를 낭비하고서야 insert에서 뒤늦게 실패한다 — 이 사전 확인이
    // 있는 이유 자체가 사라진다. PostgREST 원문은 로그로만 남긴다.
    console.error(`중복 확인 조회 실패 (source_ref=${pageTitle}): ${existingErr.message}`);
    back("중복 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.", from);
  }

  if (existing) {
    redirect(`/admin/books/${existing.id}?exists=1`);
  }

  let epub: Uint8Array;
  try {
    epub = await fetchEpub(pageTitle);
    assertClean(epub);
  } catch (err) {
    back(err instanceof Error ? err.message : "본문을 받지 못했습니다.", from);
  }

  const meta = readEpubMetadata(epub);

  // 파일 경로에 id가 필요하지만 행을 먼저 만들 수는 없다 — EPUB 없이
  // INSERT하면 books_needs_epub_or_store_ref CHECK에 걸린다. id를 여기서
  // 정하고 업로드를 끝낸 뒤 한 번에 INSERT한다 (saveBook과 같은 순서).
  const bookId = crypto.randomUUID();
  const path = `${bookId}.epub`;
  const uploaded: UploadedFile[] = [];

  // 비공개 버킷 접근이 필요해 스토리지만 service role로 처리한다.
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("epubs")
    .upload(path, epub, { contentType: "application/epub+zip", upsert: true });

  if (upErr) {
    back(`본문 업로드에 실패했습니다: ${upErr.message}`, from);
  }
  uploaded.push({ bucket: "epubs", path });

  // 행 쓰기는 RLS 클라이언트로 — 보안은 RLS가 담당한다 (FRONTEND.md §5).
  const { error: insertErr } = await db.from("books").insert({
    id: bookId,
    title: meta.title ?? pageTitle,
    author,
    category,
    epub_path: path,
    file_size_mb: Math.round((epub.length / 1024 / 1024) * 100) / 100,
    source: "wikisource",
    source_ref: meta.pageTitle ?? pageTitle,
  });

  if (insertErr) {
    await removeUploaded(uploaded);

    if (/books_source_ref_key/.test(insertErr.message)) {
      // 사전 확인은 관리자가 입력한 값(pageTitle)으로 조회했지만, 방금 넣은
      // 값은 위키문헌이 리다이렉트를 따라가며 정한 source_ref다. 관리자가
      // 리다이렉트 별칭 제목을 입력했다면 둘이 달라 사전 확인을 통과하고
      // 여기 unique 인덱스에서야 걸린다 — 그래도 계약대로 기존 도서 수정
      // 화면으로 보낸다. 조회 자체가 안 되면(row가 사라졌거나 등) 배너로
      // 물러난다.
      const insertedRef = meta.pageTitle ?? pageTitle;
      const { data: dup, error: dupErr } = await db
        .from("books")
        .select("id")
        .eq("source_ref", insertedRef)
        .maybeSingle();

      if (dupErr) {
        // 이 조회가 실패해도 배너로 물러나는 결과는 같다 — 사용자에게 새
        // 분기를 보여줄 필요는 없지만, "왜 리다이렉트 대신 배너가 떴는지"는
        // 로그로 남겨야 나중에 답할 수 있다.
        console.error(`중복 도서 재조회 실패 (source_ref=${insertedRef}): ${dupErr.message}`);
      }

      if (dup) {
        redirect(`/admin/books/${dup.id}?exists=1`);
      }

      back("이미 등록된 위키문헌 문서입니다.", from);
    } else {
      // 그 밖의 실패(제약 조건 등)는 PostgREST 원문을 그대로 보여줘 봐야
      // 관리자가 고칠 수 있는 정보가 아니다 — saveBook의 humanize()와 같은
      // 이유로 로그에만 원문을 남기고 화면에는 일반 문구를 띄운다.
      console.error(`도서 저장 실패 (bookId=${bookId}): ${insertErr.message}`);
      back("도서 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.", from);
    }
  }

  revalidatePath("/admin/books");
  // 목록의 「✓ 등록됨」 표시가 즉시 반영돼야 한다. 없으면 관리자가 목록으로
  // 돌아왔을 때 방금 가져온 작품이 아직 「가져오기」로 보여 두 번 누른다.
  revalidatePath("/admin/books/wikisource");
  redirect(`/admin/books/${bookId}?imported=1`);
}
