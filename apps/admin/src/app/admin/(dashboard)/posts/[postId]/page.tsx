import type { FeedCardLayout } from "@ttokttok/shared/feed";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PostForm } from "@/components/admin/post-form";
import { VideoPostForm } from "@/components/admin/video-post-form";
import { getBookOptions } from "@/lib/admin-books";

export const metadata: Metadata = { title: "게시물 수정" };

export default async function EditPostPage({
  params,
}: PageProps<"/admin/posts/[postId]">) {
  const { postId } = await params;
  const db = await createClient();

  const [
    { data: post, error: postError },
    { data: channels, error: channelsError },
    books,
  ] = await Promise.all([
    db
      .from("posts")
      .select(
        "id, channel_id, book_id, status, type, post_cards(template, regions, background), post_videos(source_type, video_path, youtube_id)",
      )
      .eq("id", postId)
      .maybeSingle(),
    db.from("channels").select("id, name, slug, avatar_url").order("name"),
    getBookOptions(),
  ]);

  // 삼키면 실패가 notFound()로 둔갑한다 — 관리자는 "조회가 실패했다"와
  // "그런 게시물이 없다"를 구분할 수 없고, 멀쩡히 있는 게시물을 지워진
  // 것으로 착각한다. 관용구는 reports/page.tsx 참고(어드민 내부 화면이라
  // 별도 에러 UI 없이 던진다).
  if (postError) throw new Error(postError.message);
  // 채널 목록이 조용히 비면 셀렉트가 텅 빈 채로 뜨고, 관리자는 채널이
  // 하나도 없는 것으로 읽는다.
  if (channelsError) throw new Error(channelsError.message);

  if (!post) notFound();

  if (post.type === "video") {
    const v = post.post_videos as unknown as {
      source_type: "upload" | "youtube";
      video_path: string | null;
      youtube_id: string | null;
    } | null;

    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold">영상 게시물 수정</h1>
        <VideoPostForm
          post={{
            id: post.id,
            channel_id: post.channel_id,
            book_id: post.book_id,
            source_type: v?.source_type ?? "upload",
            video_path: v?.video_path ?? null,
            youtube_id: v?.youtube_id ?? null,
          }}
          channels={channels ?? []}
          books={books}
        />
      </div>
    );
  }

  // post_id가 PK인 1:1 조인이라 객체(또는 null)로 온다.
  const card = post.post_cards as unknown as FeedCardLayout | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">카드 게시물 수정</h1>
      <PostForm
        post={{
          id: post.id,
          channel_id: post.channel_id,
          book_id: post.book_id,
          status: post.status === "published" ? "published" : "draft",
          card: card ? { ...card, regions: card.regions ?? {} } : null,
        }}
        channels={channels ?? []}
        books={books}
      />
    </div>
  );
}
