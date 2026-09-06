"use client";

import { useEffect, useRef, useState } from "react";
import { UploadVideo } from "@/components/feed/upload-video";
import { YoutubeVideo } from "@/components/feed/youtube-video";
import { useOverlayPresence } from "@/components/overlay-presence";
import type { FeedVideo } from "@/lib/feed";

/**
 * 영상 게시물 재생기 (PRD §5.3).
 *
 * 여기는 소스 분기와 재생 여부 판정만 한다. 재생 제어와 컨트롤은 소스별
 * 컴포넌트가 맡고, 둘이 공유하는 것은 음소거 버튼뿐이다 (설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 재생 조건은 둘이다 — 화면에 들어와 있고(IntersectionObserver, FRONTEND.md
 * §6), 바텀시트에 덮이지 않았을 때. 피드에는 여러 게시물이 동시에 마운트돼
 * 있으므로(가상화 창) 첫 조건이 없으면 안 보이는 영상까지 돌아가고, 둘째가
 * 없으면 시트 뒤에서 소리가 계속 난다.
 */
export function VideoPlayer({
  video,
  poster,
}: {
  video: FeedVideo;
  poster?: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { open: overlayOpen } = useOverlayPresence();

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

  // 바텀시트가 덮고 있으면 화면 밖과 똑같이 취급한다 — 소리가 시트 뒤에서
  // 계속 나면 안 된다. 자식 재생기는 active만 보므로 판정은 여기서 끝난다.
  //
  // 사용자가 직접 멈춰 둔 영상은 시트를 여닫아도 멈춘 채로 남는다: active가
  // 먼저 false로 내려가고 그 뒤에 우리가 pause를 부르므로, 재생기들이
  // "사용자가 멈췄다"고 기록하는 경로(화면에 있는 동안의 정지)를 타지 않는다.
  const active = visible && !overlayOpen;

  return (
    <div ref={hostRef} className="relative h-full w-full">
      {video.source_type === "upload" && video.video_path ? (
        <UploadVideo src={video.video_path} poster={poster} active={active} />
      ) : video.youtube_id ? (
        <YoutubeVideo videoId={video.youtube_id} active={active} />
      ) : (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          영상을 불러올 수 없어요.
        </div>
      )}
    </div>
  );
}
