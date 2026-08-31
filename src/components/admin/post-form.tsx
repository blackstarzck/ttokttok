import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PostEditor } from "@/components/admin/post-editor";
import type { BookOption } from "@/components/admin/book-select";
import type { PreviewChannel } from "@/components/admin/post-preview";
import type { FeedCardLayout } from "@/lib/feed";
import { savePost } from "@/app/admin/(dashboard)/posts/actions";

export type PostFormValues = {
  id: string;
  channel_id: string;
  book_id: string;
  status: "draft" | "published";
  card: FeedCardLayout | null;
};

/**
 * 카드 게시물 폼.
 *
 * 입력과 미리보기는 PostEditor(클라이언트)가 갖고, 여기는 form 껍데기와
 * 제출 버튼만 남는다 — 서버 액션에 붙는 지점이 한 곳이어야 발행/임시저장
 * 분기가 흩어지지 않는다.
 */
export function PostForm({
  post,
  channels,
  books,
}: {
  post?: PostFormValues;
  channels: PreviewChannel[];
  books: BookOption[];
}) {
  return (
    <form action={savePost} className="flex flex-col gap-6">
      <input type="hidden" name="id" value={post?.id ?? ""} />

      <PostEditor post={post} channels={channels} books={books} />

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
