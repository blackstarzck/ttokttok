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
    .select("id, title, author, category, epub_path, isbn, cover_url, intro, rights_note")
    .order("title");

  return (
    <div className="flex flex-col gap-6">
      {/*
        버튼이 하나에서 둘로 늘면서 375px 폭에서 제목 열을 짓눌렀다 —
        제목 블록은 flex-1뿐이라 min-width: auto로 내용만큼 버텨 섰고,
        버튼은 shrink-0·whitespace-nowrap(button.tsx)이라 줄지도 줄바꿈도
        안 됐다. sm 미만은 세로로 쌓고 min-w-0으로 제목 블록이 실제로
        줄어들 수 있게 한다. 그리드 컬럼 전환에 이미 쓰는 sm 기준을 따른다
        (books/import, book-form 등).
      */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-bold">도서</h1>
          <p className="text-muted-foreground text-sm">
            EPUB이 있으면 전문 도서, 없으면 링크형 도서입니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/books/import">위키문헌에서 가져오기</Link>
          </Button>
          <Button asChild className="min-h-11">
            <Link href="/admin/books/new">새 도서</Link>
          </Button>
        </div>
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
                  <div className="flex flex-wrap gap-1">
                    {b.epub_path ? (
                      <Badge>전문</Badge>
                    ) : (
                      <Badge variant="secondary">링크형</Badge>
                    )}
                    {/*
                      임포트는 본문과 서지 최소값만 채운다. 소개는 도서 상세
                      시트의 첫 섹션이라 유형과 무관하게 항상 필요하다.
                      권리 근거(rights_note)는 얘기가 다르다 — "본문을 어떤
                      근거로 공개하는지"를 적는, 전문 도서 전용 개념이다
                      (PRD §5.11). 링크형 도서는 본문을 안 실으니 애초에
                      공개 판단이 없고, book-form.tsx도 이 필드를 필수로
                      두지 않는다. 전문 도서 여부와 무관하게 rights_note를
                      요구하면 모든 링크형 도서가 영원히 `미완성`을 달고
                      살게 되고, 관리자가 규칙에 없는 자리표시자 문구로
                      메꾸는 쪽으로 몰린다(§11-48이 명시적으로 금지한 바로
                      그 상황). 그래서 rights_note는 EPUB이 있는 도서에만
                      요구한다. 표지·인용구는 유형과 무관하게 없어도
                      정상이므로 판정에서 뺀다 (PRD §5.11, §5.12).
                    */}
                    {(!b.intro || (b.epub_path && !b.rights_note)) && (
                      <Badge variant="outline">미완성</Badge>
                    )}
                  </div>
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
