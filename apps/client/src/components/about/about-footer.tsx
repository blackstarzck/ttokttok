import Link from "next/link";
import { Globe, Mail, Phone, Sparkles } from "lucide-react";
import { AssetSlot } from "@/components/about/asset-slot";
import { Container } from "@/components/about/primitives";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "서비스",
    links: [
      { href: "/", label: "홈 피드" },
      { href: "/reels", label: "릴스" },
      { href: "/discover", label: "탐색" },
      { href: "/profile", label: "프로필" },
      { href: "/notifications", label: "알림" },
      { href: "/login", label: "로그인" },
    ],
  },
  {
    title: "도서",
    links: [
      { href: "/discover", label: "전문 도서" },
      { href: "/discover", label: "링크형 도서" },
      { href: "/discover", label: "장르별 탐색" },
      { href: "/discover", label: "급상승" },
      { href: "/discover", label: "채널" },
    ],
  },
  {
    title: "안내",
    links: [
      { href: "/about", label: "소개" },
      { href: "#faq", label: "저작권 안내" },
      { href: "#faq", label: "자주 묻는 질문" },
      { href: "/admin", label: "관리자" },
    ],
  },
];

/**
 * 참고 사이트 푸터 — 연락 카드 + 링크 3열 + 거대 워드마크. 연락처 값과 소셜
 * 아이콘, 워드마크는 전부 에셋 자리다.
 */
export function AboutFooter() {
  return (
    <footer>
      <Container className="pt-20 pb-10">
        <div className="border-border/60 grid gap-12 border-t pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="bg-card self-start rounded-[1.75rem] p-7">
            <p className="text-2xl font-medium">연락</p>
            <p className="text-muted-foreground mt-4 flex items-center gap-2">
              <Globe className="size-4 shrink-0" aria-hidden />
              <AssetSlot className="h-3.5 w-56 rounded" />
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-3">
                <p className="text-muted-foreground flex items-center gap-2">
                  <Phone className="size-4 shrink-0" aria-hidden />
                  <AssetSlot className="h-3.5 w-28 rounded" />
                </p>
                <p className="text-muted-foreground flex items-center gap-2">
                  <Mail className="size-4 shrink-0" aria-hidden />
                  <AssetSlot className="h-3.5 w-36 rounded" />
                </p>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className="bg-muted grid size-12 place-items-center rounded-2xl"
                  >
                    <AssetSlot tone="inset" className="size-5 rounded-sm" />
                  </span>
                ))}
              </div>
            </div>
            <p className="text-muted-foreground mt-10 flex items-center gap-2 text-sm">
              <Sparkles className="size-4 shrink-0" aria-hidden />
              지식이 똑똑 노크해요
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-lg font-medium">{col.title}</p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* 거대 워드마크(잔디 질감 글자) 자리 */}
        <AssetSlot
          tone="inset"
          className="mt-20 h-40 w-full rounded-t-[2rem] md:h-64 lg:h-80"
        />
        <p className="text-muted-foreground mt-6 text-xs">© 2026 똑똑</p>
      </Container>
    </footer>
  );
}
