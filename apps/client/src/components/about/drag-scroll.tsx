"use client";

import {
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@ttokttok/ui/utils";

/**
 * 마우스로 잡아 끄는 가로 스크롤러 — 참고 사이트 히어로 띠의 Swiper free-mode.
 * 터치는 브라우저가 이미 끌어 주므로 마우스 포인터만 다룬다.
 *
 * `startAtSecond`: 데스크톱에서는 두 번째 카드가 컨테이너 왼쪽 선에 오도록
 * 시작해 첫 카드가 왼쫑에 살짝 걸친다(참고 사이트의 초기 오프셋 = 첫 카드 폭
 * + 간격). 서버 HTML은 0에서 시작하고 하이드레이션 직후 옮긴다.
 */
export function DragScroll({
  children,
  className,
  startAtSecond = false,
}: {
  children: ReactNode;
  className?: string;
  startAtSecond?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !startAtSecond) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollLeft = first.offsetWidth + gap;
  }, [startAtSecond]);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft };
    ref.current.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    ref.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    drag.current = null;
    ref.current.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={cn("cursor-grab select-none active:cursor-grabbing", className)}
    >
      {children}
    </div>
  );
}
