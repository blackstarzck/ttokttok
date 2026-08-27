import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin-guard";
import { Button } from "@/components/ui/button";

/**
 * 어드민 셸. (main) 그룹 밖이라 GNB가 없고, 데이터 입력이 주 목적이라
 * 모바일 프레임을 벗어나 넓게 쓴다 (PRD §5.10 — 기능 우선).
 *
 * (dashboard) 그룹에만 걸리므로 /admin/login은 이 셸을 물려받지 않는다.
 */
async function signOut() {
  "use server";
  const db = await createClient();
  await db.auth.signOut();
  redirect("/admin/login");
}

const NAV = [
  { href: "/admin/books", label: "도서" },
  { href: "/admin/posts", label: "게시물" },
  { href: "/admin/channels", label: "채널" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-background sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/admin" className="text-sm font-bold">
            똑똑 관리자
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">서비스 보기</Link>
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                로그아웃
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
