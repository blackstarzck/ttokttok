import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { saveChannel, deleteChannel } from "./actions";

export const metadata: Metadata = { title: "채널 관리" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function AdminChannelsPage({
  searchParams,
}: PageProps<"/admin/channels">) {
  const sp = await searchParams;
  const db = await createClient();

  const { data: channels } = await db
    .from("channels")
    .select("id, name, slug, genre, description, avatar_url")
    .order("name");

  const editing = q(sp.edit)
    ? channels?.find((c) => c.id === q(sp.edit))
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">채널</h1>
        <p className="text-muted-foreground text-sm">
          게시물을 발행하는 장르별 큐레이션 페르소나입니다.
        </p>
      </header>

      <AdminNotice error={q(sp.error)} />
      <AdminToast
        message={q(sp.saved) ? "저장했습니다." : q(sp.deleted) ? "삭제했습니다." : undefined}
      />

      <section className="border-border flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">
          {editing ? `채널 수정 — ${editing.name}` : "새 채널"}
        </h2>

        <form action={saveChannel} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={editing?.id ?? ""} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">이름 *</Label>
              <Input id="name" name="name" defaultValue={editing?.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">슬러그 *</Label>
              <Input
                id="slug"
                name="slug"
                defaultValue={editing?.slug}
                placeholder="night-sentences"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="genre">장르 *</Label>
              <Input id="genre" name="genre" defaultValue={editing?.genre} required />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">소개</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={editing?.description ?? ""}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="avatar_url">아바타 이미지 URL</Label>
            <Input
              id="avatar_url"
              name="avatar_url"
              defaultValue={editing?.avatar_url ?? ""}
              placeholder="비워 두면 이름 첫 글자로 표시됩니다"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="min-h-11">
              {editing ? "수정" : "추가"}
            </Button>
            {editing ? (
              <Button asChild variant="ghost" className="min-h-11">
                <a href="/admin/channels">취소</a>
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>슬러그</TableHead>
            <TableHead>장르</TableHead>
            <TableHead className="text-right">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels?.length ? (
            channels.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.slug}</TableCell>
                <TableCell>{c.genre}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/admin/channels?edit=${c.id}`}>수정</a>
                    </Button>
                    <ConfirmDelete
                      action={deleteChannel}
                      hidden={{ id: c.id }}
                      message={`채널 "${c.name}"을(를) 삭제할까요? 이 채널의 게시물이 있으면 삭제되지 않습니다.`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-center">
                채널이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
