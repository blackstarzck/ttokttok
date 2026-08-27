import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PostForm } from "@/components/admin/post-form";

export const metadata: Metadata = { title: "게시물 수정" };

export default async function EditPostPage({
  params,
}: PageProps<"/admin/posts/[postId]">) {
  const { postId } = await params;
  const db = await createClient();

  const [{ data: post }, { data: channels }, { data: books }] = await Promise.all([
    db
      .from("posts")
      .select("id, channel_id, book_id, status, post_cards(sort_order, template_category, body)")
      .eq("id", postId)
      .maybeSingle(),
    db.from("channels").select("id, name").order("name"),
    db.from("books").select("id, title, author").order("title"),
  ]);

  if (!post) notFound();

  const cards = [...(post.post_cards ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      template_category: c.template_category,
      body: (c.body ?? {}) as Record<string, string>,
    }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">게시물 수정</h1>
      <PostForm
        post={{
          id: post.id,
          channel_id: post.channel_id,
          book_id: post.book_id,
          status: post.status,
          cards,
        }}
        channels={channels ?? []}
        books={books ?? []}
      />
    </div>
  );
}
