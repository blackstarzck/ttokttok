import type { Metadata } from "next";
import { ArrowDown, ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AdminNotice } from "@/components/admin/admin-notice";
import { AdminToast } from "@/components/admin/admin-toast";
import {
  addFeatured,
  moveFeatured,
  removeFeatured,
  toggleFeatured,
} from "./actions";

export const metadata: Metadata = { title: "오늘의 추천" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function AdminFeaturedPage({
  searchParams,
}: PageProps<"/admin/featured">) {
  const sp = await searchParams;
  const db = await createClient();

  const [{ data: featured }, { data: books }] = await Promise.all([
    db
      .from("featured_books")
      .select("book_id, sort_order, active, books ( id, title, author )")
      .order("sort_order"),
    db.from("books").select("id, title, author").order("title"),
  ]);

  const rows = featured ?? [];
  const featuredIds = new Set(rows.map((r) => r.book_id));
  const candidates = (books ?? []).filter((b) => !featuredIds.has(b.id));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">오늘의 추천</h1>
        <p className="text-muted-foreground text-sm">
          탐색 탭 상단에 가로로 노출됩니다. 3~5권을 권장합니다.
        </p>
      </header>

      <AdminNotice error={q(sp.error)} />
      <AdminToast
        message={
          q(sp.saved) ? "저장했습니다." : q(sp.removed) ? "내렸습니다." : undefined
        }
      />

      <section className="border-border flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">도서 추가</h2>
        {candidates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            모든 도서가 이미 추천 목록에 있습니다.
          </p>
        ) : (
          <form action={addFeatured} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-60 flex-1 flex-col gap-2">
              <Label htmlFor="book_id">도서</Label>
              <select
                id="book_id"
                name="book_id"
                required
                defaultValue=""
                className="border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value="" disabled>
                  선택하세요
                </option>
                {candidates.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} — {b.author}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="min-h-11">
              추가
            </Button>
          </form>
        )}
      </section>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          추천 도서가 없습니다. 탐색 탭에서 '오늘의 추천' 영역이 숨겨집니다.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const book = row.books as unknown as {
              title: string;
              author: string;
            } | null;

            return (
              <li
                key={row.book_id}
                className="border-border flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="text-muted-foreground w-6 text-sm tabular-nums">
                  {i + 1}
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium break-keep">
                    {book?.title ?? "—"}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {book?.author ?? ""}
                  </span>
                </span>

                {row.active ? null : <Badge variant="secondary">내림</Badge>}

                <div className="flex shrink-0 gap-1">
                  <form action={moveFeatured}>
                    <input type="hidden" name="book_id" value={row.book_id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-lg"
                      className="min-h-11 min-w-11"
                      aria-label="위로"
                      disabled={i === 0}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                  </form>

                  <form action={moveFeatured}>
                    <input type="hidden" name="book_id" value={row.book_id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-lg"
                      className="min-h-11 min-w-11"
                      aria-label="아래로"
                      disabled={i === rows.length - 1}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </form>

                  <form action={toggleFeatured}>
                    <input type="hidden" name="book_id" value={row.book_id} />
                    <input
                      type="hidden"
                      name="active"
                      value={row.active ? "0" : "1"}
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                    >
                      {row.active ? "내리기" : "올리기"}
                    </Button>
                  </form>

                  <form action={removeFeatured}>
                    <input type="hidden" name="book_id" value={row.book_id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-destructive min-h-11"
                    >
                      제거
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
