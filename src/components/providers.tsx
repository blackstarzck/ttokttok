"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * 클라이언트 데이터 계층 (FRONTEND.md §4 — 서버 상태는 TanStack Query).
 *
 * QueryClient를 모듈 최상단이 아니라 상태로 만든다. 서버에서 모듈이
 * 공유되면 요청끼리 캐시가 섞인다.
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
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
