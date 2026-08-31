import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminNotice } from "@/components/admin/admin-notice";
import { AdminToast } from "@/components/admin/admin-toast";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { deleteBook } from "./actions";

export const metadata: Metadata = { title: "도서 관리" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function AdminBooksPage({
  searchParams,
}: PageProps<"/admin/books">) {
  const sp = await searchParams;
  const db = await createClient();

  const { data: books } = await db
    .from("books")
    .select("id, title, author, category, epub_path, isbn, cover_url")
    .order("title");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="text-xl font-bold">도서</h1>
          <p className="text-muted-foreground text-sm">
            EPUB이 있으면 전문 도서, 없으면 링크형 도서입니다.
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link href="/admin/books/new">새 도서</Link>
        </Button>
      </header>

      <AdminNotice error={q(sp.error)} />
      <AdminToast
        message={
          q(sp.saved) ? "저장했습니다." : q(sp.deleted) ? "삭제했습니다." : undefined
        }
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>제목</TableHead>
            <TableHead>저자</TableHead>
            <TableHead>분류</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>표지</TableHead>
            <TableHead className="text-right">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {books?.length ? (
            books.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium break-keep">{b.title}</TableCell>
                <TableCell>{b.author}</TableCell>
                <TableCell>{b.category}</TableCell>
                <TableCell>
                  {b.epub_path ? (
                    <Badge>전문</Badge>
                  ) : (
                    <Badge variant="secondary">링크형</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {b.cover_url ? "있음" : "없음"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/books/${b.id}`}>수정</Link>
                    </Button>
                    <ConfirmDelete
                      action={deleteBook}
                      hidden={{ id: b.id }}
                      message={`"${b.title}"을(를) 삭제할까요? 이 도서를 쓰는 게시물이 있으면 삭제되지 않습니다.`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground text-center">
                도서가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
