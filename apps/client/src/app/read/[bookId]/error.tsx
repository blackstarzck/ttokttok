"use client";

import { useEffect } from "react";
import { LoadFailed } from "@/components/load-failed";

/**
 * `/read/[bookId]` 전용 에러 경계.
 *
 * 이 페이지도 렌더 중 `getCurrentUser()`(lib/auth.ts)를 await한다 — throw가
 * 삼켜지지 않고 올라오게 바뀐 것은 `(main)/error.tsx`와 같은 이유다(§11-61).
 * 이 경로는 `(main)` 그룹 밖이라(뷰어는 GNB 없는 풀스크린, `read/[bookId]`
 * 아래에 자기 layout.tsx도 없다) `(main)/error.tsx`가 이 오류를 못 받는다 —
 * 형제 그룹이지 조상이 아니어서 Next가 경계를 거슬러 올라가도 거기 닿지
 * 않는다. 그래서 별도 착지점이 필요하다.
 *
 * `read/` 아래 페이지는 지금 이거 하나뿐이라 상위(`read/error.tsx`)가 아니라
 * 이 페이지와 같은 폴더에 바로 둔다 — 여러 하위 페이지를 함께 덮어야 해서
 * 조상 세그먼트로 올린 `not-found.tsx`(`(main)` 그룹 전체를 덮는다)와는
 * 이유가 다르다: 덮어야 할 페이지가 하나뿐이면 그 페이지 옆이 가장 직접적인
 * 자리다.
 *
 * `LoadFailed`는 `h-full`로 부모 높이를 채우는데, `(main)/layout.tsx`처럼
 * `h-dvh` 컨테이너를 이미 깔아 주는 조상이 여기는 없다 — 이 라우트는 루트
 * `layout.tsx` 바로 아래라 body의 `min-h-full`만 있고, 그건 자손의 퍼센트
 * 높이가 기대대로 잡히기에 충분하지 않다(뷰어 로딩 폴백도 같은 이유로
 * `reader-loader.tsx`에서 직접 `h-dvh`를 준다). 그래서 여기서 그 높이를
 * 대신 깔아 준다.
 *
 * 문구는 기본값 대신 "책"을 명시한다 — 이 경계는 화면 하나만 덮으므로
 * 어떤 화면인지 안다는 점이 `(main)/error.tsx`와 다르고, 뷰어의 로딩
 * 폴백("책을 여는 중…")과 어조를 맞출 수 있다.
 *
 * `retry`/`reset`을 쓰지 않는 이유는 `(main)/error.tsx`와 같다 — `LoadFailed`가
 * 이미 주는 "홈으로" 탈출로를 넘어서는 재시도 UI를 새로 만드는 것은 이
 * 작업의 범위 밖이다.
 */
export default function ReadError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // 조회 실패를 기록한다(§11-61).
    console.error(error);
  }, [error]);

  return (
    <div className="h-dvh">
      <LoadFailed message="책을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
    </div>
  );
}
