import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AdminNotice } from "@/components/admin/admin-notice";
import { formatCount } from "@/lib/format";
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
      "id, status, type, like_count, comment_count, view_count, books(title), channels(name)",
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
        <Button asChild className="min-h-11">
          <Link href="/admin/posts/new">새 게시물</Link>
        </Button>
      </header>

      <AdminNotice
        error={q(sp.error)}
        success={q(sp.saved) ? "저장했습니다." : q(sp.deleted) ? "삭제했습니다." : undefined}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>도서</TableHead>
            <TableHead>채널</TableHead>
            <TableHead>상태</TableHead>
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
                  <TableCell className="font-medium break-keep">
                    {book?.title ?? "—"}
                  </TableCell>
                  <TableCell>{channel?.name ?? "—"}</TableCell>
                  <TableCell>
                    {p.status === "published" ? (
                      <Badge>발행</Badge>
                    ) : (
                      <Badge variant="secondary">임시</Badge>
                    )}
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
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/posts/${p.id}`}>수정</Link>
                      </Button>
                      <form action={deletePost}>
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                          삭제
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground text-center">
                게시물이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
