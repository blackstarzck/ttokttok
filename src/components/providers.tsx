"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OverlayPresenceProvider } from "@/components/overlay-presence";

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

/**
 * 어드민은 라이트 고정 (결정 기록 §11-35).
 *
 * 왜 어드민 레이아웃이 아니라 여기서 거는가: next-themes는 상위에 이미
 * 컨텍스트가 있으면 중첩 ThemeProvider를 통째로 무시한다. 어드민 안에
 * 프로바이더를 하나 더 두는 방법이 없어 루트에서 경로로 판단한다.
 *
 * forcedTheme은 저장된 선택값을 덮어쓰지 않는다 — 어드민을 나가면
 * 사용자가 고른 테마로 그대로 돌아온다.
 */
function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
      forcedTheme={isAdminPath(pathname) ? "light" : undefined}
    >
      <QueryClientProvider client={client}>
        <OverlayPresenceProvider>{children}</OverlayPresenceProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
