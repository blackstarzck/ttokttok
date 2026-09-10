import Link from "next/link";
import { BookOpen, ChevronDown, LogIn, Search } from "lucide-react";
import { BrandLogo } from "@ttokttok/ui/brand-logo";
import { CONTAINER, DarkButton } from "@/components/about/primitives";
import { cn } from "@ttokttok/ui/utils";

const LINKS = [
  { href: "#screens", label: "화면", menu: true },
  { href: "#plans", label: "이용 방식", menu: false },
  { href: "#capabilities", label: "기능", menu: true },
  { href: "#works", label: "작품", menu: false },
  { href: "#faq", label: "자주 묻는 질문", menu: false },
] as const;

/**
 * 소개 페이지 상단 바. 앱의 `TopBar`(홈 전용)와 별개다 — 이 페이지는 `(main)`
 * 그룹 밖이라 셸을 공유하지 않는다. 참고 사이트처럼 로고 · 가운데 메뉴 ·
 * 오른쪽 로그인·탐색·검정 CTA.
 */
export function AboutNav() {
  return (
    <header className="bg-card/85 sticky top-0 z-50 backdrop-blur">
      <div
        className={cn(
          CONTAINER,
          "flex h-[4.5rem] items-center justify-between gap-6",
        )}
      >
        <Link
          href="/about"
          className="focus-visible:ring-ring rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <BrandLogo priority />
        </Link>

        <nav
          aria-label="소개 페이지 메뉴"
          className="hidden items-center gap-2 text-sm lg:flex"
        >
          {LINKS.map((link) => (
            // 참고 사이트 `.navbar-link:hover` — 0.25s로 연한 알약 배경이 깔린다.
            <a
              key={link.href}
              href={link.href}
              className="text-foreground/80 hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-1 rounded-xl px-3 py-2 transition-colors duration-[250ms] focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
              {link.menu ? (
                <ChevronDown className="size-3.5" aria-hidden />
              ) : null}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/login"
            className="text-foreground/80 hover:text-foreground focus-visible:ring-ring hidden items-center gap-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none sm:inline-flex"
          >
            <LogIn className="size-4" aria-hidden />
            로그인
          </Link>
          <Link
            href="/discover"
            className="text-foreground/80 hover:text-foreground focus-visible:ring-ring hidden items-center gap-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
          >
            <Search className="size-4" aria-hidden />
            탐색
          </Link>
          <DarkButton href="/" className="h-11 px-5 text-sm">
            <BookOpen className="size-4" aria-hidden />
            피드 열기
          </DarkButton>
        </div>
      </div>
    </header>
  );
}
