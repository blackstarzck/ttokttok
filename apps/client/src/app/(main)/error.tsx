"use client";

import { LoadFailed } from "@/components/load-failed";

/**
 * (main) 그룹 전용 에러 경계.
 *
 * `getCurrentUser()`(lib/auth.ts)는 이제 `profiles` 조회가 실패하면 삼키지
 * 않고 throw한다(§11-61) — 조회 실패를 "게스트"로 위장해 멀쩡히 로그인한
 * 사용자를 강등시키던 문제를 막기 위해서다. `(main)` 아래에서 렌더 중
 * 이 함수를 await하는 화면(홈·릴스·채널 릴스·프로필·알림·게시물 상세)이
 * 전부 이 throw를 받아낼 준비가 없었고, 그 결과가 착지할 곳이 이 파일이다.
 *
 * 루트가 아니라 여기 두는 이유는 `not-found.tsx`와 같다: `(main)/layout.tsx`
 * (BottomNav 포함) 안에서 렌더되어 앱 셸이 그대로 남는다. 이 파일이 없으면
 * 오류가 루트까지 올라가 Next 기본 에러 화면(영어, 크롬 없음, 하단
 * 내비게이션도 없어 돌아갈 길이 없음)으로 새고, 그 화면은 고치기 전
 * (틀린 "게스트" 화면이지만 셸은 온전) 보다 나쁘다.
 *
 * `retry()`로 세그먼트를 다시 받아오는 선택지도 있다(이 저장소의 Next
 * 포크는 v16.3부터 `reset`과 별도로 `retry`를 안정 API로 제공한다 — 근거:
 * node_modules/next/dist/docs/.../file-conventions/error.md). 여기서는
 * 쓰지 않는다: `LoadFailed`는 재시도 버튼이 아니라 "홈으로" 링크로
 * 빠져나갈 길을 주는 컴포넌트이고, 이 화면들이 던지는 조회 실패에
 * "다시 시도"가 실제로 성공할지는 화면마다 다른데 그 판단을 여기서
 * 대신할 근거가 없다. 착지점 하나만 만드는 것이 이 작업의 범위다.
 *
 * `getCurrentUser`가 어떤 화면에서 왜 던졌는지는 이 경계가 모른다 —
 * 화면별로 다른 문구를 주고 싶다면 각 화면에 자기 `error.tsx`를 두거나
 * `LoadFailed`에 `message`를 넘겨야 하는데, 지금은 일곱 화면 모두에
 * 똑같이 적용 가능한 공용 문구(`LoadFailed`의 기본값)로 충분하다.
 */
export default function MainError() {
  return <LoadFailed />;
}
