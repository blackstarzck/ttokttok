import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
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
  { href: "/admin/featured", label: "추천" },
  { href: "/admin/reports", label: "신고" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-dvh">
      {/*
        375px에서 셸이 가로로 넘치던 것을 두 줄로 눕혀 막는다.

        원래는 줄바꿈 없는 한 줄이었다 — 브랜드 + 내비 5개(실측 256px) +
        우측 그룹(실측 162px)에 gap까지 더하면 min-content가 약 478px인데,
        375px 뷰포트의 본문 폭은 343px뿐이다. 그래서 **모든** 어드민 화면이
        가로 스크롤을 만들었고(테이블이 없는 /admin 대시보드까지),
        브랜드는 shrink 보호가 없어 13px로 짓눌려 읽히지도 않았다.

        내비(256)와 우측 그룹(162)은 각각은 343px에 들어간다. 그래서
        flex-wrap으로 내비만 자기 줄로 내린다 — 마크업을 복제하지 않으려고
        `order-last w-full`을 쓰고, sm 이상에서 원래의 한 줄 순서로 되돌린다.
        sm 기준은 이 저장소가 폭 전환에 이미 쓰는 값이다.

        내비에 overflow-x-auto를 둔 이유: 항목이 하나 더 늘어도 페이지가
        아니라 내비가 스크롤한다. 어드민 테이블이 쓰는 것과 같은 봉쇄 방식이다.
      */}
      <header className="border-border bg-background sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="flex shrink-0 items-center gap-2 text-sm font-bold">
            <BrandLogo priority />
            <span>관리자</span>
          </Link>

          <nav className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
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
