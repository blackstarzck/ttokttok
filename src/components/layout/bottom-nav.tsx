"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Home, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "홈", icon: Home, filled: "M10.8 2.6a2 2 0 0 1 2.4 0l7 5.4A2 2 0 0 1 21 9.6V20a2 2 0 0 1-2 2h-4v-8H9v8H5a2 2 0 0 1-2-2V9.6A2 2 0 0 1 3.8 8Z" },
  { href: "/reels", label: "릴스", icon: Clapperboard, filled: "M3.5 5.2 18.8 2a2 2 0 0 1 2.4 1.5l.6 2.9L2.3 10.5l-.5-2.9a2 2 0 0 1 1.7-2.4ZM6 4.7l2.5 3.6 1.8-.4-2.5-3.6Zm6-1.3 2.5 3.6 1.8-.4-2.5-3.6ZM2 11h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Zm8 2.5v6l5-3Z" },
  { href: "/discover", label: "탐색", icon: Search, filled: "M10.5 2a8.5 8.5 0 1 0 4.85 15.48l4.8 4.8a1.5 1.5 0 0 0 2.13-2.13l-4.8-4.8A8.5 8.5 0 0 0 10.5 2Zm0 4a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" },
  { href: "/profile", label: "프로필", icon: User, filled: "M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10ZM9 14h6a6 6 0 0 1 6 6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1a6 6 0 0 1 6-6Z" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-50 border-t backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon, filled }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true" focusable="false">
                    <path d={filled} fillRule="evenodd" clipRule="evenodd" />
                  </svg>
                ) : (
                  <Icon className="size-6" strokeWidth={2} aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
