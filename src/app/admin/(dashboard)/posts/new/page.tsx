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
  const [{ data: channels, error: channelsError }, books] = await Promise.all([
    db.from("channels").select("id, name, slug, avatar_url").order("name"),
    getBookOptions(),
  ]);

  // 삼키면 채널 셀렉트가 텅 빈 채로 뜬다 — 관리자는 채널을 먼저 만들어야
  // 하는 줄 알고 이미 있는 채널을 다시 만든다. 관용구는 reports/page.tsx 참고.
  if (channelsError) throw new Error(channelsError.message);

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
