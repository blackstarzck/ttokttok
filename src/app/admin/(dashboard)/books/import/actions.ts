"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { removeUploaded, type UploadedFile } from "@/lib/admin-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  assertClean,
  fetchEpub,
  readEpubMetadata,
  toPageTitle,
} from "@/lib/wikisource";

/**
 * 위키문헌 EPUB 임포트 (PRD §5.10, §5.11).
 *
 * 관리자가 문서 주소·저자·카테고리를 넣으면 본문을 받아 정리해 올리고
 * `books` 행을 **바로 만든다**. 그리고 수정 화면으로 보낸다 —
 * 소개·인용구·권리 근거는 편집 판단이라 기계가 채울 수 없고, 저자는
 * ws-export가 `dc:creator`를 아예 넣지 않아 원천이 없다 (§11-48).
 *
 * 제목은 `dc:title`로 채운다. 위키문헌 문서 제목에는 「진달래꽃 (시집)」
 * 처럼 판본 괄호가 붙는 경우가 있고 **그걸 자동으로 떼지 않는다** —
 * 규칙화하면 정상 제목의 괄호까지 먹는다. 수정 화면에서 사람이 고친다.
 */

/**
 * 등록 금지 저작자 (PRD §5.11).
 *
 * 위키문헌에 문서가 있다는 사실이 "공개해도 된다"로 오독되는 지점이
 * 여기다 — 위키문헌은 우리와 다른 기준으로 운영된다. 그래서 임포트
 * 경로에만 관문을 둔다. 수동 등록(saveBook)은 막지 않는다: 손으로 적어
 * 넣는 행위에는 이런 오독이 끼어들지 않는다.
 */
const BLOCKED_AUTHORS: Record<string, string> = {
  정지용: "월북·납북 작가 — 사망 연도가 불확실합니다",
  이태준: "월북·납북 작가 — 사망 연도가 불확실합니다",
  박태원: "월북·납북 작가 — 사망 연도가 불확실합니다",
  홍명희: "월북·납북 작가 — 사망 연도가 불확실합니다",
  김기림: "월북·납북 작가 — 사망 연도가 불확실합니다",
  백석: "1996년 사망 — 저작권이 존속합니다 (사후 70년)",
  박경리: "2008년 사망 — 저작권이 존속합니다 (사후 70년)",
};

const str = (fd: FormData, key: string) =>
  String(fd.get(key) ?? "").trim() || null;

/**
 * 오류를 안고 임포트 화면으로 되돌린다.
 *
 * **화살표 함수가 아니라 함수 선언이어야 한다.** 타입스크립트의 제어 흐름
 * 분석은 `never`를 돌려주는 호출 뒤를 도달 불가로 보는데, 그 판단은 호출
 * 대상이 함수 선언(또는 명시적 타입을 가진 const 변수)일 때만 적용된다.
 * `const back = (m: string): never => …` 로 쓰면 아래에서 `source`가
 * `string | null`로 남아 타입 오류가 난다.
 */
function back(message: string): never {
  redirect(`/admin/books/import?error=${encodeURIComponent(message)}`);
}

export async function importFromWikisource(formData: FormData) {
  await requireAdmin();

  const source = str(formData, "source");
  const author = str(formData, "author");
  const category = str(formData, "category");

  if (!source || !author || !category) {
    back("문서 주소·저자·카테고리는 모두 필요합니다.");
  }

  const blocked = BLOCKED_AUTHORS[author.replace(/\s+/g, "")];
  if (blocked) {
    back(`「${author}」은 등록할 수 없습니다 — ${blocked} (PRD §5.11 등록 금지 목록).`);
  }

  // redirect()는 예외를 던져 동작한다. try 안에서 부르면 그 catch가
  // 리다이렉트를 삼키므로, 던질 수 있는 호출만 좁게 감싸고 결과를 밖에서 쓴다.
  let pageTitle: string;
  try {
    pageTitle = toPageTitle(source);
  } catch (err) {
    back(err instanceof Error ? err.message : "문서 주소를 읽을 수 없습니다.");
  }

  const db = await createClient();

  // 4MB를 받기 전에 먼저 확인한다. unique 인덱스는 최종 방어선으로 남긴다.
  const { data: existing } = await db
    .from("books")
    .select("id")
    .eq("source_ref", pageTitle)
    .maybeSingle();

  if (existing) {
    redirect(`/admin/books/${existing.id}?exists=1`);
  }

  let epub: Uint8Array;
  try {
    epub = await fetchEpub(pageTitle);
    assertClean(epub);
  } catch (err) {
    back(err instanceof Error ? err.message : "본문을 받지 못했습니다.");
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
    back(`본문 업로드에 실패했습니다: ${upErr.message}`);
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
    back(
      /books_source_ref_key/.test(insertErr.message)
        ? "이미 등록된 위키문헌 문서입니다."
        : insertErr.message,
    );
  }

  revalidatePath("/admin/books");
  redirect(`/admin/books/${bookId}?imported=1`);
}
