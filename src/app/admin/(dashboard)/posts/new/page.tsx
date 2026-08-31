import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PostForm } from "@/components/admin/post-form";
import { VideoPostForm } from "@/components/admin/video-post-form";
import { getBookOptions } from "@/lib/admin-books";

export const metadata: Metadata = { title: "새 게시물" };

export default async function NewPostPage({
  searchParams,
}: PageProps<"/admin/posts/new">) {
  const { type } = await searchParams;
  const isVideo = type === "video";

  const db = await createClient();
  const [{ data: channels }, books] = await Promise.all([
    db.from("channels").select("id, name, slug, avatar_url").order("name"),
    getBookOptions(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">
        {isVideo ? "새 영상 게시물" : "새 카드 게시물"}
      </h1>
      {isVideo ? (
        <VideoPostForm channels={channels ?? []} books={books} />
      ) : (
        <PostForm channels={channels ?? []} books={books} />
      )}
    </div>
  );
}
