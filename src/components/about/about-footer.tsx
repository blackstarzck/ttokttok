import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

const LINKS = [
  { href: "/", label: "홈" },
  { href: "/discover", label: "탐색" },
  { href: "/reels", label: "릴스" },
] as const;

export function AboutFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div>
          <BrandLogo />
          <p className="text-muted-foreground mt-1 text-sm">
            지식이 똑똑 노크해요
          </p>
        </div>
        <nav className="flex gap-6" aria-label="서비스 바로가기">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-12">
        <p className="text-muted-foreground text-xs">© 2026 똑똑</p>
      </div>
    </footer>
  );
}
