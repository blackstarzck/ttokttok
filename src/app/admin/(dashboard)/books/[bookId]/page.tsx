import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export default async function EditBookPage({
  params,
}: PageProps<"/admin/books/[bookId]">) {
  const { bookId } = await params;
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
      <BookForm book={book as BookFormValues} />
    </div>
  );
}
