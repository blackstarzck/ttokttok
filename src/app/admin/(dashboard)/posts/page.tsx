import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdminNotice } from "@/components/admin/admin-notice";
import { AdminToast } from "@/components/admin/admin-toast";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { formatCount, formatDate } from "@/lib/format";
import { deletePost } from "./actions";

export const metadata: Metadata = { title: "게시물 관리" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function AdminPostsPage({
  searchParams,
}: PageProps<"/admin/posts">) {
  const sp = await searchParams;
  const db = await createClient();

  const { data: posts } = await db
    .from("posts")
    .select(
      "id, status, type, published_at, created_at, like_count, comment_count, view_count, books(title), channels(name)",
    )
    .order("published_at", { ascending: false, nullsFirst: false });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="text-xl font-bold">게시물</h1>
          <p className="text-muted-foreground text-sm">
            카드를 조합해 피드에 내보냅니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild className="min-h-11">
            <Link href="/admin/posts/new">새 카드 게시물</Link>
          </Button>
          <Button asChild variant="secondary" className="min-h-11">
            <Link href="/admin/posts/new?type=video">새 영상 게시물</Link>
          </Button>
        </div>
      </header>

      <AdminNotice error={q(sp.error)} />
      <AdminToast
        message={q(sp.saved) ? "저장했습니다." : q(sp.deleted) ? "삭제했습니다." : undefined}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>도서</TableHead>
            <TableHead>채널</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>날짜</TableHead>
            <TableHead className="text-right">조회</TableHead>
            <TableHead className="text-right">좋아요</TableHead>
            <TableHead className="text-right">댓글</TableHead>
            <TableHead className="text-right">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts?.length ? (
            posts.map((p) => {
              const book = p.books as unknown as { title: string } | null;
              const channel = p.channels as unknown as { name: string } | null;
              return (
                <TableRow key={p.id}>
                  <TableCell className="break-keep">
                    <span className="font-medium">{book?.title ?? "—"}</span>
                    {/* 사용자 화면 주소가 /p/{id}다 — 그 파라미터를 그대로 보여준다. */}
                    <code
                      title={p.id}
                      className="text-muted-foreground block text-[11px] font-normal"
                    >
                      {p.id}
                    </code>
                  </TableCell>
                  <TableCell>{channel?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.type === "video" ? "영상" : "카드"}
                  </TableCell>
                  <TableCell>
                    {p.status === "published" ? (
                      <Badge>발행</Badge>
                    ) : (
                      <Badge variant="secondary">임시</Badge>
                    )}
                  </TableCell>
                  {/* 발행 전에는 발행일이 없다 — 작성일로 대신한다. */}
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                    {formatDate(p.published_at ?? p.created_at)}
                    {p.published_at ? "" : " 작성"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(p.view_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(p.like_count)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCount(p.comment_count)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {/* 실제 사용자 화면. 임시저장 글도 관리자에게는 열린다(RLS). */}
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/p/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          보기
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/posts/${p.id}`}>수정</Link>
                      </Button>
                      <ConfirmDelete
                        action={deletePost}
                        hidden={{ id: p.id }}
                        message={`"${book?.title ?? "이 게시물"}" 게시물을 삭제할까요? 카드·영상과 좋아요·댓글이 함께 지워집니다.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={9} className="text-muted-foreground text-center">
                게시물이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
