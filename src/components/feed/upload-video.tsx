"use client";

import { useEffect, useRef, useState } from "react";
import { VideoChrome } from "@/components/feed/video-chrome";

/**
 * 업로드 mp4 재생기 (PRD §5.3).
 *
 * 재생 여부는 VideoPlayer의 IntersectionObserver가 정하고 여기는 active만
 * 받는다 — 피드에는 여러 게시물이 동시에 마운트돼 있으므로(가상화 창)
 * 그냥 두면 안 보이는 영상까지 돌아간다.
 */
export function UploadVideo({
  src,
  poster,
  active,
}: {
  src: string;
  poster?: string | null;
  active: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  // 사용자가 직접 멈춘 영상은 화면을 벗어났다 돌아와도 스스로 재생하지 않는다.
  const pausedByUser = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (active && !pausedByUser.current) {
      // 자동재생은 음소거 상태에서만 허용된다. 거부돼도 무시한다.
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active]);

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        // 풀블리드다 — 분할된 상자에 맞추려던 레터박스가 더는 필요 없다.
        className="h-full w-full object-cover"
      />

      <VideoChrome
        playing={playing}
        muted={muted}
        togglePlay={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            pausedByUser.current = false;
            el.play().catch(() => {});
          } else {
            pausedByUser.current = true;
            el.pause();
          }
        }}
        toggleMute={() => setMuted((m) => !m)}
      />
    </>
  );
}
