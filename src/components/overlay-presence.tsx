"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * 화면을 덮는 오버레이(바텀시트)가 열려 있는지 알리는 셸 범위 컨텍스트
 * (FRONTEND.md §4 — UI 상태다. 전역 스토어가 아니다).
 *
 * 쓰는 곳은 지금 하나다: 영상 게시물이 시트에 덮이면 재생을 멈춘다. 안 그러면
 * 시트 뒤에서 소리가 계속 나고 데이터도 계속 흐른다.
 *
 * **세는 이유**: 시트 위에 시트가 겹친다 (도서 상세 시트 안의 로그인 시트).
 * 불리언이면 안쪽 시트가 닫힐 때 바깥 시트가 아직 열려 있는데도 재생이
 * 살아난다.
 *
 * **등록은 `components/ui/drawer.tsx` 한 곳에서만 한다** — 모든 시트가 그
 * 래퍼를 거치므로, 새 시트를 만드는 사람이 이 규약을 몰라도 지켜진다.
 */
type OverlayPresence = {
  /** 열려 있는 오버레이가 하나라도 있는가. */
  open: boolean;
  /** 오버레이 하나를 등록하고 해제 함수를 돌려준다 (effect 정리에 쓴다). */
  register: () => () => void;
};

const OverlayPresenceContext = createContext<OverlayPresence>({
  open: false,
  // 프로바이더 밖에서도 터지지 않게 한다 — 시트는 어디서든 쓰일 수 있다.
  register: () => () => {},
});

export function OverlayPresenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [count, setCount] = useState(0);

  const register = useCallback(() => {
    setCount((current) => current + 1);
    return () => setCount((current) => current - 1);
  }, []);

  const value = useMemo(
    () => ({ open: count > 0, register }),
    [count, register],
  );

  return (
    <OverlayPresenceContext.Provider value={value}>
      {children}
    </OverlayPresenceContext.Provider>
  );
}

export function useOverlayPresence() {
  return useContext(OverlayPresenceContext);
}
