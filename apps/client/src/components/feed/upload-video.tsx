"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VideoChrome } from "@/components/feed/video-chrome";
import { hasPlaybackBuffer } from "@/lib/video-preload";
import { VideoWait } from "@/components/feed/video-wait";
import type { VideoController } from "@ttokttok/ui/media/hls-controller";

/**
 * 업로드 mp4 재생기 (PRD §5.3).
 *
 * 재생 여부는 VideoPlayer의 IntersectionObserver가 정하고 여기는 active만
 * 받는다 — 피드에는 여러 게시물이 동시에 마운트돼 있으므로(가상화 창)
 * 그냥 두면 안 보이는 영상까지 돌아간다.
 */
export function UploadVideo({
  src,
  hls,
  poster,
  active,
  load,
  onBuffer,
}: {
  src: string;
  hls?: string | null;
  poster?: string | null;
  active: boolean;
  load: boolean;
  onBuffer?: (ready: boolean) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const controller = useRef<VideoController | null>(null);
  const activeRef = useRef(active);
  const [status, setStatus] = useState<"loading" | "playing" | "paused" | "blocked" | "error">("loading");
  const [muted, setMuted] = useState(true);
  // 사용자가 직접 멈춘 영상은 화면을 벗어났다 돌아와도 스스로 재생하지 않는다.
  const pausedByUser = useRef(false);
  const playhead = useRef(0);
  const playRequest = useRef(0);
  const cancelPlay = useCallback(() => { playRequest.current++; }, []);

  const play = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const request = ++playRequest.current;
    setStatus("loading");
    el.play().catch((error: unknown) => {
      // Leaving a video cancels play(). Its late result must not affect the next attempt.
      if (request !== playRequest.current) return;
      const name = error instanceof DOMException ? error.name : "";
      if (name === "AbortError") return;
      setStatus(name === "NotAllowedError" ? "blocked" : "error");
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !load) return;
    let cancelled = false;
    if (hls) {
      import("@ttokttok/ui/media/hls-controller").then(({ attachHls }) => {
        if (cancelled) return;
        controller.current = attachHls(el, { hls, fallback: src, active: activeRef.current,
          onReady: () => { if (activeRef.current && !pausedByUser.current) play(); },
          onError: () => setStatus("error"),
        });
      }).catch(() => { if (!cancelled) { el.src = src; el.load(); if (activeRef.current && !pausedByUser.current) play(); } });
    } else { el.src = src; el.load(); }
    return () => {
      cancelled = true;
      cancelPlay();
      playhead.current = el.currentTime;
      controller.current?.destroy(); controller.current = null;
      el.pause();
      // preload="none" alone does not cancel an existing download.
      el.removeAttribute("src");
      el.load();
    };
  }, [src, hls, load, cancelPlay, play]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    activeRef.current = active;
    controller.current?.setActive(active);
    if (active && load && !pausedByUser.current && (!hls || controller.current)) {
      play();
    } else {
      el.pause();
      onBuffer?.(false);
    }
    return cancelPlay;
  }, [active, load, hls, play, onBuffer, cancelPlay]);

  const reportBuffer = () => {
    const el = ref.current;
    if (el && active) onBuffer?.(
      !el.paused && el.readyState >= 3 && hasPlaybackBuffer(el.buffered, el.currentTime, el.duration),
    );
  };

  const retry = () => {
    const el = ref.current;
    if (!el || !active) return;
    pausedByUser.current = false;
    if (controller.current) controller.current.retry();
    else el.load();
    play();
  };

  return (
    <>
      <video
        ref={ref}
        poster={poster ?? undefined}
        muted={muted}
        loop
        playsInline
        preload={load ? "auto" : "none"}
        onLoadedMetadata={() => {
          const el = ref.current;
          if (el && playhead.current > 0 && playhead.current < el.duration) el.currentTime = playhead.current;
          playhead.current = 0;
        }}
        onPlaying={() => { setStatus("playing"); reportBuffer(); }}
        onPause={() => {
          // A failed play also emits pause; it must not hide the retry action.
          setStatus((previous) => ref.current?.error ? "error" :
            previous === "error" || previous === "blocked" ? previous : "paused");
          onBuffer?.(false);
        }}
        onWaiting={() => { setStatus("loading"); onBuffer?.(false); }}
        onProgress={reportBuffer}
        onTimeUpdate={reportBuffer}
        onError={() => { if (!controller.current) setStatus("error"); onBuffer?.(false); }}
        // 풀블리드다 — 분할된 상자에 맞추려던 레터박스가 더는 필요 없다.
        className="h-full w-full object-cover"
      />

      <VideoChrome
        playing={status === "playing" || status === "loading"}
        muted={muted}
        togglePlay={() => {
          const el = ref.current;
          if (!el) return;
          if (el.paused) {
            pausedByUser.current = false;
            play();
          } else {
            pausedByUser.current = true;
            el.pause();
          }
        }}
        toggleMute={() => setMuted((m) => !m)}
      />
      {active && status === "loading" ? <VideoWait onRetry={retry} /> : null}
      {active && (status === "error" || status === "blocked") ? (
        <div className="absolute inset-0 z-[3] flex items-center justify-center p-6">
          <div role="status" className="bg-background text-foreground flex flex-col items-center gap-3 rounded-lg border p-4 text-center text-sm break-keep">
            <p>{status === "blocked" ? "재생 버튼을 눌러 영상을 시작해 주세요." : "영상을 불러오지 못했어요."}</p>
            <button type="button" onClick={retry} className="focus-visible:ring-ring min-h-11 rounded-md px-4 underline focus-visible:ring-2 focus-visible:outline-none">
              {status === "blocked" ? "영상 재생" : "영상 다시 시도"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
