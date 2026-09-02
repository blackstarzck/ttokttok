"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { VideoChrome } from "@/components/feed/video-chrome";
import { useYoutubePlayer } from "@/components/feed/use-youtube-player";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

/**
 * 재생이 시작된 뒤 유튜브가 그리는 컨트롤이 사라질 때까지 덮어 두는 시간.
 * 실측 1~2초 — 넉넉히 잡되 진입 체감이 상하지 않는 값.
 */
const CHROME_FADE_MS = 1500;

/**
 * 자동재생이 시작되기를 기다려 주는 시간. 이 동안에는 가운데 ▶ 표시를
 * 유보한다 — 진입할 때마다 깜빡이면 안 되지만, 브라우저가 자동재생을 막은
 * 경우에는 탭하면 된다는 신호가 있어야 한다. 그래서 유보에 시한을 둔다.
 */
const AUTOPLAY_GRACE_MS = 2500;

/**
 * 유튜브 크롬 띠를 화면 밖으로 밀어내는 크롭.
 *
 * 상단 제목·채널 바와 하단 "동영상 더보기"·로고 바는 iframe의 위아래 끝에
 * 그려지므로, iframe을 위아래로 120px씩 키우면 article의 overflow-hidden이
 * 잘라낸다. 플레이어는 영상을 iframe 중앙에 맞추므로 세로로만 키우고 같은
 * 양을 위로 당기면 영상의 위치·크기는 변하지 않는다.
 *
 * iframe은 replaced 요소라 top·bottom만 주면 늘어나지 않고 기본 150px로
 * 돌아간다 — 높이를 직접 준다.
 */
const CROP =
  "absolute inset-x-0 -top-30 h-[calc(100%+240px)] w-full border-0 pointer-events-none";

/**
 * 유튜브 영상 게시물 재생기 (PRD §5.3, 설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 유튜브 자체 UI는 지울 수 없으므로 세 겹으로 가린다: 크롭(위 상수),
 * playlist 파라미터 제거(⏮⏭가 재생목록 UI라서 생긴다 — 루프는 이 훅이
 * 되감아 처리한다), 그리고 시작 직후의 마스크.
 */
export function YoutubeVideo({
  videoId,
  active,
}: {
  videoId: string;
  active: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { failed, playing, muted, togglePlay, toggleMute } = useYoutubePlayer({
    videoId,
    active,
    mountRef,
  });

  // 마스크는 플레이어 생성 직후 한 번만 쓴다. hasPlayed는 false→true로만
  // 바뀌므로 타이머 효과가 한 번만 돈다 — playing에 직접 걸면 사용자가
  // 마스크 도중 탭할 때 타이머가 취소된다.
  const [hasPlayed, setHasPlayed] = useState(false);
  const [masked, setMasked] = useState(true);
  const [graceOver, setGraceOver] = useState(false);

  useEffect(() => {
    if (playing) setHasPlayed(true);
  }, [playing]);

  useEffect(() => {
    const id = window.setTimeout(() => setGraceOver(true), AUTOPLAY_GRACE_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hasPlayed) return;
    const id = window.setTimeout(() => setMasked(false), CHROME_FADE_MS);
    return () => window.clearTimeout(id);
  }, [hasPlayed]);

  // API 스크립트가 막혔다 — 컨트롤 없이 파라미터 임베드로 되돌린다.
  // 크롬이 조금 보이더라도 영상이 아예 안 나오는 것보다 낫다.
  if (failed) {
    return (
      <iframe
        src={youtubeEmbedUrl(videoId)}
        title="도서 소개 영상"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className={CROP}
      />
    );
  }

  return (
    <>
      {/* API가 이 div 안에 iframe을 만든다. 크롭은 그 자식에게 건다. */}
      <div
        ref={mountRef}
        className="absolute inset-0 [&>iframe]:pointer-events-none [&>iframe]:absolute [&>iframe]:inset-x-0 [&>iframe]:-top-30 [&>iframe]:h-[calc(100%+240px)] [&>iframe]:w-full [&>iframe]:border-0"
      />

      {/* 시작 마스크. 영상이 레터박스로 들어가므로 검정 바탕 + object-contain. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-black transition-opacity duration-300",
          masked ? "opacity-100" : "opacity-0",
        )}
      >
        <Image
          src={youtubeThumbnailUrl(videoId)}
          alt=""
          fill
          sizes="480px"
          className="object-contain"
        />
      </div>

      <VideoChrome
        playing={playing}
        muted={muted}
        togglePlay={togglePlay}
        toggleMute={toggleMute}
        busy={!hasPlayed && !graceOver}
      />
    </>
  );
}
