import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** signed URL 유효 시간. 한 번 앉아서 읽는 시간을 넉넉히 덮는다. */
const SIGNED_URL_TTL_SEC = 60 * 60 * 4;

export type ReaderBook = {
  id: string;
  title: string;
  author: string;
  epubUrl: string;
};

/**
 * 뷰어에 필요한 도서 정보 + EPUB signed URL.
 *
 * 전문 도서(epub_path NOT NULL)만 연다 — 링크형 도서는 뷰어에 진입하지
 * 않는다 (PRD §5.4). 열 수 없으면 null을 준다.
 *
 * epubs는 비공개 버킷이라 anon 키로는 접근할 수 없고, 서버가 service
 * role로 signed URL을 발급해 클라이언트에 건넨다.
 */
export async function getReaderBook(
  bookId: string,
): Promise<ReaderBook | null> {
  const db = await createClient();

  const { data: book, error } = await db
    .from("books")
    .select("id, title, author, epub_path")
    .eq("id", bookId)
    .maybeSingle();

  if (error) {
    console.error("getReaderBook:", error.message);
    return null;
  }
  if (!book?.epub_path) return null;

  const { data: signed, error: signError } = await createAdminClient()
    .storage.from("epubs")
    .createSignedUrl(book.epub_path, SIGNED_URL_TTL_SEC);

  if (signError || !signed) {
    console.error("signed URL:", signError?.message);
    return null;
  }

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    epubUrl: signed.signedUrl,
  };
}
