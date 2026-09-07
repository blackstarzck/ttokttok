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
      {/*
        saveBook은 생성·수정 모두 /admin/books?saved=1로 리다이렉트한다 —
        이 화면(수정 상세)으로 돌아오는 흐름이 없으니 "저장했습니다"는
        여기서 절대 뜨지 않는다. 여기 붙는 쿼리 키는 임포트발(위키문헌
        가져오기)뿐이라 imported·exists만 다룬다. saved를 다시 넣고
        싶다면 saveBook의 리다이렉트 대상부터 바꿔야 한다(별개 결정).
      */}
      <AdminToast
        message={
          q(sp.imported)
            ? "본문을 받았습니다. 소개·권리 근거를 채워 주세요."
            : q(sp.exists)
              ? "이미 등록된 위키문헌 문서입니다 — 기존 도서를 엽니다."
              : undefined
        }
        // exists는 임포트가 실제로 일어나지 않은 안내다 — 성공 토스트로
        // 보이면 관리자가 방금 새로 들여온 걸로 오해한다.
        variant={q(sp.exists) ? "info" : "success"}
      />
      <BookForm book={book as BookFormValues} />
    </div>
  );
}
