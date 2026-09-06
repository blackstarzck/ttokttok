"use client";

import { Pause, Play } from "lucide-react";
import { MuteButton } from "@/components/feed/mute-button";
import { cn } from "@/lib/utils";

/**
 * 업로드 mp4 게시물의 재생 컨트롤 (PRD §5.3).
 *
 * 유튜브 게시물은 이걸 쓰지 않는다 — 플레이어 자체 버튼이 재생/일시정지를
 * 맡는다. 유튜브 UI는 우리가 끌 수도 바꿀 수도 없으므로(파라미터 없음,
 * 약관도 금지) 겹쳐 놓고 싸우는 대신 유형별로 주체를 나눴다. 대신 모양은
 * 최대한 맞춘다: 가운데 원형 글리프 + 우측 상단 음소거 버튼이라는 구성이
 * 유튜브 플레이어와 같고, 음소거 버튼은 실제로 같은 컴포넌트다.
 */
export function VideoChrome({
  playing,
  muted,
  togglePlay,
  toggleMute,
}: {
  playing: boolean;
  muted: boolean;
  togglePlay: () => void;
  toggleMute: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "일시정지" : "재생"}
        className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset focus-visible:outline-none"
      />

      {/*
        멈춘 동안에만. 마운트를 유지하고 opacity로 여닫는다 — 유튜브 플레이어의
        글리프가 페이드로 사라지는 것과 같은 인상을 주기 위함이다.
        pointer-events-none — 탭 레이어가 계속 포인터를 받아야 한다.
      */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-[3] flex items-center justify-center transition-opacity duration-200",
          playing ? "opacity-0" : "opacity-100",
        )}
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-black/50 text-white">
          {playing ? (
            <Pause className="size-7 fill-current" />
          ) : (
            <Play className="size-7 fill-current" />
          )}
        </span>
      </span>

      <MuteButton muted={muted} onToggle={toggleMute} />
    </>
  );
}
