"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeUploaded, type UploadedFile } from "@/lib/admin-storage";
import {
  CoverImageError,
  coverImageFiles,
  prepareCoverImages,
} from "@/lib/book-cover-images";
import { pathFromPublicUrl } from "@ttokttok/shared/storage-path";
import type { TablesInsert } from "@ttokttok/database/types";
import { readCoverDesign } from "@ttokttok/shared/cover-design";
import { parseYoutubeId } from "@ttokttok/shared/youtube";

/**
 * 도서 CRUD (PRD §5.10).
 *
 * 도서 유형은 따로 고르지 않는다 — EPUB이 있으면 전문 도서, 없으면
 * 링크형이다 (§11-29). DB의 CHECK가 "본문도 서점 링크도 없는 도서"를
 * 막으므로, 링크형인데 ISBN·구매 링크가 없으면 저장이 거부된다.
 */

const str = (fd: FormData, key: string) =>
  String(fd.get(key) ?? "").trim() || null;

const num = (fd: FormData, key: string) => {
  const v = str(fd, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 목차는 줄바꿈으로 구분해 입력받는다 — 폼에서 배열을 다루는 가장 단순한 방법. */
function parseToc(fd: FormData): string[] {
  return String(fd.get("toc") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 구매 링크는 서점별 URL 3칸. 하나도 없으면 null(=ISBN 자동 생성). */
function parsePurchaseLinks(fd: FormData): Record<string, string> | null {
  const entries = (["kyobo", "yes24", "aladin"] as const)
    .map((key) => [key, str(fd, `purchase_${key}`)] as const)
    .filter(([, url]) => url) as [string, string][];
  return entries.length ? Object.fromEntries(entries) : null;
}

/**
 * DB CHECK 위반 원문은 관리자가 읽고 고칠 수 없다 — 무엇이 빠졌는지로 바꾼다.
 */
function humanize(message: string): string {
  if (message.includes("books_needs_epub_or_store_ref")) {
    return "EPUB 파일이 없으면 ISBN이나 구매 링크 중 하나는 있어야 합니다 (링크형 도서).";
  }
  return message;
}

export async function saveBook(formData: FormData) {
  await requireAdmin();

  const id = str(formData, "id");
  const title = str(formData, "title");
  const author = str(formData, "author");
  const category = str(formData, "category");

  if (!title || !author || !category) {
    redirect("/admin/books?error=제목·저자·카테고리는 필수입니다");
  }

  const db = await createClient();
  const admin = createAdminClient();

  const values: TablesInsert<"books"> = {
    title,
    author,
    translator: str(formData, "translator"),
    publisher: str(formData, "publisher"),
    category,
    isbn: str(formData, "isbn"),
    page_count: num(formData, "page_count"),
    pub_date_paper: str(formData, "pub_date_paper"),
    pub_date_ebook: str(formData, "pub_date_ebook"),
    intro: str(formData, "intro"),
    quote: str(formData, "quote"),
    quote_source: str(formData, "quote_source"),
    toc: parseToc(formData),
    source: str(formData, "source"),
    rights_note: str(formData, "rights_note"),
    purchase_links: parsePurchaseLinks(formData),
  };

  // 트레일러 입력은 어떤 업로드보다 먼저 검증한다 — 표지·EPUB이 올라간 뒤
  // 트레일러 때문에 되돌리는 일이 없게 (설계 §6.2).
  const trailerSource = str(formData, "trailer_source") ?? "none";
  if (!["none", "youtube", "upload"].includes(trailerSource)) {
    redirect("/admin/books?error=트레일러 소스를 골라야 합니다");
  }
  const trailerYoutubeId =
    trailerSource === "youtube"
      ? parseYoutubeId(String(formData.get("trailer_youtube_url") ?? ""))
      : null;
  if (trailerSource === "youtube" && !trailerYoutubeId) {
    redirect("/admin/books?error=유튜브 주소에서 영상 ID를 찾지 못했습니다");
  }
  const trailerUploadId = trailerSource === "upload" ? str(formData, "video_upload_id") : null;
  if (trailerSource === "upload" && !trailerUploadId) {
    // 기존 upload 트레일러가 있을 때만 "유지"가 성립한다.
    const existing = id
      ? await db.from("book_trailers").select("source_type").eq("book_id", id).maybeSingle()
      : { data: null, error: null };
    if (existing.error) redirect("/admin/books?error=트레일러 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    if (existing.data?.source_type !== "upload") {
      redirect("/admin/books?error=영상 업로드를 먼저 완료하세요");
    }
  }

  // 파일 경로에 id가 필요하지만, 행을 먼저 만들 수는 없다 — EPUB 없이
  // INSERT하면 books_needs_epub_or_store_ref CHECK(본문·ISBN·구매 링크 중
  // 하나)에 걸려 전문 도서 등록이 통째로 막힌다. id를 여기서 정하고
  // 업로드를 끝낸 뒤 한 번에 INSERT한다.
  const bookId = id ?? crypto.randomUUID();

  // 검증은 업로드 전에 끝낸다. 설정만 저장되거나, 서지 정보와 다른
  // 문구로 만든 새 이미지가 저장되는 것을 막는다.
  const cover = formData.get("cover");
  const hasCover = cover instanceof File && cover.size > 0;
  const rawDesign = str(formData, "cover_design");
  let coverDesign = null;
  if (rawDesign) {
    try {
      coverDesign =
        rawDesign.length <= 4096
          ? readCoverDesign(JSON.parse(rawDesign))
          : null;
    } catch {
      /* 아래에서 같은 안내로 처리 */
    }
    if (
      !coverDesign ||
      !hasCover ||
      coverDesign.title !== title ||
      coverDesign.author !== author
    ) {
      redirect(
        "/admin/books?error=3D 표지를 다시 열어 이미지로 적용한 뒤 저장해 주세요.",
      );
    }
  }
  let coverExtension = "";
  let previousCoverUrl: string | null = null;
  let previousDesign: unknown = null;
  if (hasCover) {
    if (cover.size > 2 * 1024 * 1024)
      redirect("/admin/books?error=표지는 2MB 이하로 올려 주세요.");
    const bytes = Buffer.from(await cover.arrayBuffer());
    if (
      cover.type === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      coverExtension = "png";
    else if (
      cover.type === "image/jpeg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    )
      coverExtension = "jpg";
    else if (
      cover.type === "image/webp" &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    )
      coverExtension = "webp";
    if (!coverExtension)
      redirect("/admin/books?error=PNG·JPEG·WebP 표지 이미지를 올려 주세요.");
    if (
      coverDesign &&
      (coverExtension !== "png" ||
        bytes.length < 24 ||
        bytes.readUInt32BE(16) !== 800 ||
        bytes.readUInt32BE(20) !== 1200)
    ) {
      redirect("/admin/books?error=3D 표지 이미지를 다시 생성해 주세요.");
    }
    if (id) {
      const previous = await db
        .from("books")
        .select("cover_url, cover_design")
        .eq("id", bookId)
        .single();
      if (previous.error)
        redirect(
          "/admin/books?error=수정할 도서를 불러오지 못했습니다. 목록에서 다시 열어 주세요.",
        );
      previousCoverUrl = previous.data.cover_url;
      previousDesign = previous.data.cover_design;
    }
  }

  // 신규 저장이 실패하면 방금 올린 파일만 남는다 — 되돌리려고 기록해 둔다.
  const uploaded: UploadedFile[] = [];

  async function fail(message: string): Promise<never> {
    // 새 표지는 고유 경로라 수정 실패 때도 안전하게 회수할 수 있다.
    // 기존 EPUB은 같은 경로를 쓰므로 수정 실패 때 지우지 않는다.
    await removeUploaded(
      id ? uploaded.filter((file) => file.bucket === "covers") : uploaded,
    );
    redirect(`/admin/books?error=${encodeURIComponent(humanize(message))}`);
  }

  // 이미지 템플릿의 면 원본. 검증이 업로드보다 먼저 끝나므로 잘못된 파일은
  // 어떤 것도 올리기 전에 걸린다. 폼의 주소는 신뢰하지 않는다 —
  // 새 파일 또는 기존 행과 같은 주소만 남는다 (book-cover-images.ts).
  if (coverDesign?.template === "image") {
    try {
      coverDesign = {
        ...coverDesign,
        images: await prepareCoverImages(
          formData,
          coverDesign,
          previousDesign,
          bookId,
          uploaded,
        ),
      };
    } catch (error) {
      await fail(
        error instanceof CoverImageError
          ? error.message
          : "표지 면 이미지를 저장하지 못했습니다. 다시 시도해 주세요.",
      );
    }
  } else if (coverDesign) {
    // 그린 템플릿에 딸려 온 면 주소는 버린다 — 참조가 없는 파일이 남지 않게.
    delete coverDesign.images;
  }

  // 파일 업로드는 비공개 버킷 접근이 필요해 service role로 처리한다.
  const epub = formData.get("epub");
  if (epub instanceof File && epub.size > 0) {
    const path = `${bookId}.epub`;
    const { error } = await admin.storage.from("epubs").upload(path, epub, {
      contentType: "application/epub+zip",
      upsert: true,
    });
    if (error) await fail(`EPUB 업로드 실패: ${error.message}`);
    uploaded.push({ bucket: "epubs", path });
    values.epub_path = path;
    values.file_size_mb = Math.round((epub.size / 1024 / 1024) * 100) / 100;
  }

  if (hasCover) {
    const path = `${bookId}/${crypto.randomUUID()}.${coverExtension}`;
    const { error } = await admin.storage
      .from("covers")
      .upload(path, cover, { contentType: cover.type, upsert: false });
    if (error) await fail(`표지 업로드 실패: ${error.message}`);
    uploaded.push({ bucket: "covers", path });
    const {
      data: { publicUrl },
    } = admin.storage.from("covers").getPublicUrl(path);
    values.cover_url = publicUrl;
    values.cover_design = coverDesign;
  }

  let update = db.from("books").update(values).eq("id", bookId);
  if (hasCover)
    update = previousCoverUrl
      ? update.eq("cover_url", previousCoverUrl)
      : update.is("cover_url", null);
  const { error } = id
    ? await update.select("id").single()
    : await db.from("books").insert({ id: bookId, ...values });

  if (error)
    await fail(
      error.code === "PGRST116"
        ? "도서가 삭제되었거나 다른 곳에서 표지가 바뀌었습니다. 목록에서 다시 열어 주세요."
        : error.message,
    );

  // 이 도서에 속한 이전 파일만, 새 주소가 저장된 뒤 회수한다.
  const previousCoverPath = pathFromPublicUrl(previousCoverUrl, "covers");
  const orphans: UploadedFile[] = [];
  if (
    previousCoverPath &&
    (previousCoverPath.startsWith(`${bookId}/`) ||
      previousCoverPath.startsWith(`${bookId}.`))
  ) {
    orphans.push({ bucket: "covers", path: previousCoverPath });
  }
  // 이전 3D 표지의 면 원본 중 새 설정이 더는 가리키지 않는 것 — 직접
  // 업로드로 바꿨거나 그린 템플릿으로 돌아갔으면 전부다.
  const stillUsed = new Set(
    coverImageFiles(values.cover_design, bookId).map((file) => file.path),
  );
  orphans.push(
    ...coverImageFiles(previousDesign, bookId).filter(
      (file) => !stillUsed.has(file.path),
    ),
  );
  await removeUploaded(orphans);

  // 도서가 저장된 뒤에만 부른다. 실패하면 도서는 남고 트레일러만 없다 —
  // 메시지에 그 사실을 적고 수정 화면으로 보내 한 번의 저장으로 재시도하게 한다.
  const { error: trailerError } = await db.rpc("save_book_trailer", {
    p_book_id: bookId,
    p_source: trailerSource,
    p_youtube_id: trailerYoutubeId ?? undefined,
    p_upload_id: trailerUploadId ?? undefined,
  });
  if (trailerError) {
    revalidatePath("/admin/books");
    redirect(
      `/admin/books/${bookId}?error=${encodeURIComponent(
        `도서는 저장했지만 트레일러를 저장하지 못했습니다: ${trailerError.message}`,
      )}`,
    );
  }

  revalidatePath("/admin/books");
  redirect(`/admin/books?saved=1`);
}

export async function deleteBook(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const db = await createClient();

  // 파일 경로는 행이 사라지기 전에 읽어 둔다 — 지운 뒤에는 어느 파일이
  // 이 도서 것이었는지 알 방법이 없고, 비공개 버킷이라 눈에도 안 띈다.
  const { data: book } = await db
    .from("books")
    .select("epub_path, cover_url, cover_design")
    .eq("id", id)
    .maybeSingle();

  const { error } = await db.from("books").delete().eq("id", id);

  if (error) {
    // 게시물이 참조 중이면 FK에 걸린다. 행이 남았으니 파일도 그대로 둔다 —
    // 여기서 지우면 멀쩡한 도서의 본문이 사라진다.
    redirect(`/admin/books?error=${encodeURIComponent(error.message)}`);
  }

  // 행이 사라진 뒤에야 파일을 치운다. 순서를 뒤집으면 위 FK 실패가
  // 본문 유실로 바뀐다.
  //
  // cover_url은 경로가 아니라 공개 URL이라 되돌려야 한다 (storage-path.ts).
  // 파일이 이미 없어도 removeUploaded는 로그만 남기고 넘어간다 — 뒤처리
  // 실패가 "삭제했습니다"를 오류로 바꿔서는 안 된다.
  const orphans: UploadedFile[] = [];
  if (book?.epub_path) orphans.push({ bucket: "epubs", path: book.epub_path });

  const coverPath = pathFromPublicUrl(book?.cover_url, "covers");
  if (coverPath) orphans.push({ bucket: "covers", path: coverPath });
  // 이미지 템플릿의 면 원본도 이 도서 것이다.
  orphans.push(...coverImageFiles(book?.cover_design, id));

  await removeUploaded(orphans);

  revalidatePath("/admin/books");
  redirect("/admin/books?deleted=1");
}
