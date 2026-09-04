import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminToast } from "@/components/admin/admin-toast";
import { BookForm, type BookFormValues } from "@/components/admin/book-form";

export async function generateMetadata({
  params,
}: PageProps<"/admin/books/[bookId]">): Promise<Metadata> {
  const { bookId } = await params;
  const db = await createClient();
  const { data } = await db
    .from("books")
    .select("title")
    .eq("id", bookId)
    .maybeSingle();
  return { title: data?.title ?? "도서 수정" };
}

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function EditBookPage({
  params,
  searchParams,
}: PageProps<"/admin/books/[bookId]">) {
  const { bookId } = await params;
  const sp = await searchParams;
  const db = await createClient();

  const { data: book } = await db
    .from("books")
    .select(
      "id, title, author, translator, publisher, category, isbn, page_count, pub_date_paper, pub_date_ebook, intro, quote, quote_source, toc, source, rights_note, epub_path, cover_url, purchase_links",
    )
    .eq("id", bookId)
    .maybeSingle();

  if (!book) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold break-keep">{book.title}</h1>
      <AdminToast
        message={
          q(sp.imported)
            ? "본문을 받았습니다. 소개·권리 근거를 채워 주세요."
            : q(sp.exists)
              ? "이미 등록된 위키문헌 문서입니다 — 기존 도서를 엽니다."
              : q(sp.saved)
                ? "저장했습니다."
                : undefined
        }
      />
      <BookForm book={book as BookFormValues} />
    </div>
  );
}
