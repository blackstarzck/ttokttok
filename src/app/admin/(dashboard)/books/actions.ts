"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const values: Record<string, unknown> = {
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

  // 파일 경로에 id가 필요하지만, 행을 먼저 만들 수는 없다 — EPUB 없이
  // INSERT하면 books_needs_epub_or_store_ref CHECK(본문·ISBN·구매 링크 중
  // 하나)에 걸려 전문 도서 등록이 통째로 막힌다. id를 여기서 정하고
  // 업로드를 끝낸 뒤 한 번에 INSERT한다.
  const bookId = id ?? crypto.randomUUID();

  // 신규 저장이 실패하면 방금 올린 파일만 남는다 — 되돌리려고 기록해 둔다.
  const uploaded: { bucket: string; path: string }[] = [];

  async function fail(message: string): Promise<never> {
    if (!id) {
      for (const f of uploaded) await admin.storage.from(f.bucket).remove([f.path]);
    }
    redirect(`/admin/books?error=${encodeURIComponent(humanize(message))}`);
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

  const cover = formData.get("cover");
  if (cover instanceof File && cover.size > 0) {
    const ext = cover.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${bookId}.${ext}`;
    const { error } = await admin.storage
      .from("covers")
      .upload(path, cover, { contentType: cover.type, upsert: true });
    if (error) await fail(`표지 업로드 실패: ${error.message}`);
    uploaded.push({ bucket: "covers", path });
    const {
      data: { publicUrl },
    } = admin.storage.from("covers").getPublicUrl(path);
    values.cover_url = publicUrl;
  }

  const { error } = id
    ? await db.from("books").update(values).eq("id", bookId)
    : await db.from("books").insert({ id: bookId, ...values });

  if (error) await fail(error.message);

  revalidatePath("/admin/books");
  revalidatePath("/");
  redirect(`/admin/books?saved=1`);
}

export async function deleteBook(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const db = await createClient();
  const { error } = await db.from("books").delete().eq("id", id);

  if (error) {
    // 게시물이 참조 중이면 FK에 걸린다.
    redirect(`/admin/books?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/books");
  redirect("/admin/books?deleted=1");
}
