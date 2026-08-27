import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "관리자" };

const CARDS = [
  {
    href: "/admin/books",
    title: "도서",
    desc: "메타데이터 · EPUB · 표지 · 구매 링크",
  },
  {
    href: "/admin/posts",
    title: "게시물",
    desc: "카드 조합 · 발행 · 지표 확인",
  },
  { href: "/admin/channels", title: "채널", desc: "큐레이션 페르소나" },
] as const;

export default async function AdminHomePage() {
  const db = await createClient();

  const [books, posts, channels] = await Promise.all([
    db.from("books").select("id", { count: "exact", head: true }),
    db.from("posts").select("id", { count: "exact", head: true }),
    db.from("channels").select("id", { count: "exact", head: true }),
  ]);

  const counts: Record<string, number | null> = {
    "/admin/books": books.count,
    "/admin/posts": posts.count,
    "/admin/channels": channels.count,
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">관리자</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="border-border hover:bg-accent focus-visible:ring-ring flex flex-col gap-1 rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <span className="flex items-baseline gap-2">
              <span className="font-medium">{c.title}</span>
              <span className="text-muted-foreground text-sm tabular-nums">
                {counts[c.href] ?? "–"}
              </span>
            </span>
            <span className="text-muted-foreground text-xs">{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
