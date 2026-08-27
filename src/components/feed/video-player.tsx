"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { youtubeEmbedUrl } from "@/lib/youtube";
import type { FeedVideo } from "@/lib/feed";

/**
 * 영상 게시물 재생기 (PRD §5.3).
 *
 * 화면에 들어올 때만 재생한다 — 피드에는 여러 게시물이 동시에 마운트돼
 * 있으므로(가상화 창) 그냥 두면 안 보이는 영상까지 소리 없이 돌아간다.
 * 판정은 IntersectionObserver가 한다 (FRONTEND.md §6).
 *
 * 유튜브는 iframe이라 우리가 재생을 제어할 수 없다. 그래서 아예
 * 화면 밖에서는 iframe을 떼어 재생을 멈춘다.
 */
export function VideoPlayer({
  video,
  poster,
}: {
  video: FeedVideo;
  poster?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.6 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (visible) {
      // 자동재생은 음소거 상태에서만 허용된다. 거부돼도 무시한다.
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [visible]);

  const isUpload = video.source_type === "upload";

  return (
    <div ref={hostRef} className="relative h-full w-full">
      {isUpload && video.video_path ? (
        <>
          <video
            ref={videoRef}
            src={video.video_path}
            poster={poster ?? undefined}
            muted={muted}
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "소리 켜기" : "소리 끄기"}
            className="focus-visible:ring-ring absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:outline-none"
          >
            {muted ? (
              <VolumeX className="size-5" aria-hidden />
            ) : (
              <Volume2 className="size-5" aria-hidden />
            )}
          </button>
        </>
      ) : video.youtube_id ? (
        // 화면 밖이면 iframe 자체를 떼어 재생을 멈춘다.
        visible ? (
          <iframe
            src={youtubeEmbedUrl(video.youtube_id)}
            title="도서 소개 영상"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <div className="bg-card h-full w-full" />
        )
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          영상을 불러올 수 없어요.
        </div>
      )}
    </div>
  );
}
