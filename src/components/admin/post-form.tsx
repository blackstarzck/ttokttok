import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CardComposer, type ComposerCard } from "@/components/admin/card-composer";
import { savePost } from "@/app/admin/(dashboard)/posts/actions";

export type PostFormValues = {
  id: string;
  channel_id: string;
  book_id: string;
  status: "draft" | "published";
  cards: ComposerCard[];
};

const selectClass =
  "border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

export function PostForm({
  post,
  channels,
  books,
}: {
  post?: PostFormValues;
  channels: { id: string; name: string }[];
  books: { id: string; title: string; author: string }[];
}) {
  return (
    <form action={savePost} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={post?.id ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel_id">채널 *</Label>
          <select
            id="channel_id"
            name="channel_id"
            defaultValue={post?.channel_id ?? ""}
            required
            className={selectClass}
          >
            <option value="" disabled>
              선택하세요
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="book_id">도서 *</Label>
          <select
            id="book_id"
            name="book_id"
            defaultValue={post?.book_id ?? ""}
            required
            className={selectClass}
          >
            <option value="" disabled>
              선택하세요
            </option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} — {b.author}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">카드 조합</h2>
        <CardComposer initial={post?.cards ?? []} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="publish"
          value="1"
          size="lg"
          className="min-h-11"
        >
          발행
        </Button>
        <Button
          type="submit"
          name="publish"
          value="0"
          variant="secondary"
          size="lg"
          className="min-h-11"
        >
          임시저장
        </Button>
        <Button asChild variant="ghost" size="lg" className="min-h-11">
          <Link href="/admin/posts">취소</Link>
        </Button>
      </div>
    </form>
  );
}
