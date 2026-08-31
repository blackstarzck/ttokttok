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

  const [{ data: post }, { data: channels }, books] = await Promise.all([
    db
      .from("posts")
      .select(
        "id, channel_id, book_id, status, type, post_cards(template, regions), post_videos(source_type, video_path, youtube_id)",
      )
      .eq("id", postId)
      .maybeSingle(),
    db.from("channels").select("id, name, slug, avatar_url").order("name"),
    getBookOptions(),
  ]);

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
  const card = post.post_cards as unknown as {
    template: string;
    regions: Record<string, { variant?: string | null; text?: string | null }>;
  } | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">카드 게시물 수정</h1>
      <PostForm
        post={{
          id: post.id,
          channel_id: post.channel_id,
          book_id: post.book_id,
          status: post.status,
          card: card ? { template: card.template, regions: card.regions ?? {} } : null,
        }}
        channels={channels ?? []}
        books={books}
      />
    </div>
  );
}
