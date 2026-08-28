"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ReaderBook } from "@/lib/book";

/**
 * epub.js는 window에 의존해 서버에서 실행될 수 없고, 무겁기도 하다.
 * ssr:false 동적 로드로 이 라우트에서만 받아 온다 (FRONTEND.md §6).
 * ssr:false는 클라이언트 컴포넌트에서만 쓸 수 있어 이 얇은 껍데기를 둔다.
 */
const Reader = dynamic(
  () => import("@/components/reader/reader").then((m) => m.Reader),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-dvh items-center justify-center gap-2 bg-[#0f0f0f] text-[#e6e6e6]">
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
