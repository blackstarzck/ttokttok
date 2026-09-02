"use client";

import { useEffect, useRef, useState } from "react";
import { UploadVideo } from "@/components/feed/upload-video";
import { youtubeEmbedUrl } from "@/lib/youtube";
import type { FeedVideo } from "@/lib/feed";

/**
 * 영상 게시물 재생기 (PRD §5.3).
 *
 * 여기는 소스 분기와 뷰포트 판정만 한다. 재생 제어는 소스별 컴포넌트가 맡고,
 * 컨트롤 UI는 둘이 공유한다 (설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 화면에 들어올 때만 재생한다 — 피드에는 여러 게시물이 동시에 마운트돼
 * 있으므로(가상화 창) 그냥 두면 안 보이는 영상까지 소리 없이 돌아간다.
 * 판정은 IntersectionObserver가 한다 (FRONTEND.md §6).
 */
export function VideoPlayer({
  video,
  poster,
}: {
  video: FeedVideo;
  poster?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { threshold: 0.6 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="relative h-full w-full">
      {video.source_type === "upload" && video.video_path ? (
        <UploadVideo src={video.video_path} poster={poster} active={active} />
      ) : video.youtube_id ? (
        // 화면 밖이면 iframe 자체를 떼어 재생을 멈춘다.
        active ? (
          <>
            <iframe
              src={youtubeEmbedUrl(video.youtube_id)}
              title="도서 소개 영상"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="pointer-events-none absolute inset-x-0 -top-30 h-[calc(100%+240px)] w-full border-0"
            />
            <div aria-hidden className="absolute inset-0" />
          </>
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
