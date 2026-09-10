"use client";

import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayPresenceProvider } from "@ttokttok/ui/overlay-presence";

/**
 * 앱 전역 프로바이더.
 *
 * - 테마: 라이트가 기본이고 다크·시스템을 고를 수 있다 (DESIGN.md).
 *   `.dark` 클래스를 html에 붙이는 방식이라 globals.css의 변수 블록이
 *   그대로 동작한다 — 컴포넌트는 손댈 게 없다.
 * - 서버 상태: TanStack Query (FRONTEND.md §4).
 *   QueryClient를 모듈 최상단이 아니라 상태로 만든다. 서버에서 모듈이
 *   공유되면 요청끼리 캐시가 섞인다.
 * - 오버레이 존재: 바텀시트가 열려 있는지 (`overlay-presence.tsx`).
 *   영상 게시물이 시트에 덮일 때 재생을 멈추기 위한 것이라 피드에만
 *   필요하지만, 시트는 어느 화면에서든 열리므로 루트에 둔다.
 */

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 시트를 여닫을 때마다 다시 받지 않도록 잠깐은 신선하다고 본다.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      forcedTheme="light"
    >
      <QueryClientProvider client={client}>
        <OverlayPresenceProvider>{children}</OverlayPresenceProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
