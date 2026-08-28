"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { DEFAULT_PREFS, THEMES } from "@/components/reader/reader-settings";
import type { ReaderBook } from "@/lib/book";

/**
 * epub.js는 window에 의존해 서버에서 실행될 수 없고, 무겁기도 하다.
 * ssr:false 동적 로드로 이 라우트에서만 받아 온다 (FRONTEND.md §6).
 * ssr:false는 클라이언트 컴포넌트에서만 쓸 수 있어 이 얇은 껍데기를 둔다.
 */
const FALLBACK =
  THEMES.find((t) => t.key === DEFAULT_PREFS.theme) ?? THEMES[0];

const Reader = dynamic(
  () => import("@/components/reader/reader").then((m) => m.Reader),
  {
    ssr: false,
    // 뷰어는 앱 테마가 아니라 자기 읽기 테마를 쓴다 — 로딩 화면도 같은 색이어야
    // 첫 페이지가 뜰 때 번쩍이지 않는다.
    loading: () => (
      <div
        className="flex h-dvh items-center justify-center gap-2"
        style={{ backgroundColor: FALLBACK.bg, color: FALLBACK.fg }}
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="text-sm">책을 여는 중…</span>
      </div>
    ),
  },
);

export function ReaderLoader({
  book,
  isLoggedIn,
}: {
  book: ReaderBook;
  isLoggedIn: boolean;
}) {
  return <Reader book={book} isLoggedIn={isLoggedIn} />;
}
