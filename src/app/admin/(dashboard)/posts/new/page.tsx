import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PostForm } from "@/components/admin/post-form";

export const metadata: Metadata = { title: "새 게시물" };

export default async function NewPostPage() {
  const db = await createClient();
  const [{ data: channels }, { data: books }] = await Promise.all([
    db.from("channels").select("id, name").order("name"),
    db.from("books").select("id, title, author").order("title"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">새 게시물</h1>
      <PostForm channels={channels ?? []} books={books ?? []} />
    </div>
  );
}
