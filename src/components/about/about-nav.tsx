import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

/**
 * 소개 페이지 상단 바. 앱의 `TopBar`(홈 전용, 56px)와 별개다 — 이 페이지는
 * `(main)` 그룹 밖이라 셸을 공유하지 않는다.
 *
 * 높이 64px 고정, 한 줄. 워드마크와 CTA 하나만 둔다.
 */
export function AboutNav() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link
          href="/about"
          className="focus-visible:ring-ring rounded-md text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          <BrandLogo />
        </Link>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
        >
          피드 열기
        </Link>
      </div>
    </header>
  );
}
