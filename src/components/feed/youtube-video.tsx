"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { VideoChrome } from "@/components/feed/video-chrome";
import { useYoutubePlayer } from "@/components/feed/use-youtube-player";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

/**
 * 유튜브가 상태 전환 글리프(⏸·▶)를 스스로 지우기까지 걸리는 시간. 끌 수도
 * 없고 타이밍도 유튜브가 정하므로, 그동안 우리 표시로 그 자리를 덮는다.
 * 유일한 조정 손잡이다 — 글리프가 삐져나오면 이 값을 올린다.
 */
const YT_GLYPH_MS = 1500;

/**
 * 썸네일 마스크를 잡아 두는 시간. 글리프는 위의 덮개가 담당하므로 여기서는
 * 플레이어가 첫 프레임을 그리기 전의 검은 화면만 가린다 — 짧게 잡는다.
 */
const POSTER_HOLD_MS = 700;

/**
 * 자동재생이 시작되기를 기다려 주는 시간. 이 동안에는 가운데 ▶ 표시를
 * 유보한다 — 진입할 때마다 깜빡이면 안 되지만, 브라우저가 자동재생을 막은
 * 경우에는 탭하면 된다는 신호가 있어야 한다. 그래서 유보에 시한을 둔다.
 */
const AUTOPLAY_GRACE_MS = 2500;

/**
 * 유튜브 UI를 밀어내고 줄이는 배치.
 *
 * 1) 크롭 — 상단 제목·채널 바와 하단 "동영상 더보기"·로고 바는 iframe의
 *    위아래 끝에 그려지므로, 위아래로 120px씩 키우면 article의
 *    overflow-hidden이 잘라낸다.
 * 2) 축소 — iframe을 3배 크기로 만들고 scale(1/3)로 되돌린다. 플레이어가
 *    자기 UI를 CSS 픽셀 기준으로 그리므로 화면상 유튜브 UI만 1/3 크기가 된다.
 *    영상은 폭에 맞춰 iframe 중앙에 놓이므로 축소 후 크기·위치가 그대로다.
 *    상태 전환 글리프(⏸)는 끌 수 없어서 작게 만들고, 남는 것은 우리
 *    표시가 덮는다(YT_GLYPH_MS). 대가는 더 큰 해상도를 받아 오는 것이다
 *    (480px 프레임 → 1440px 플레이어).
 *
 * iframe은 replaced 요소라 top·bottom만 주면 늘어나지 않고 기본 150px로
 * 돌아간다 — 높이를 직접 준다.
 */
const PLAYER = [
  "pointer-events-none absolute top-1/2 left-1/2 border-0",
  "h-[calc(300%+720px)] w-[300%] -translate-x-1/2 -translate-y-1/2 scale-[0.3334]",
].join(" ");

/**
 * 유튜브 영상 게시물 재생기 (PRD §5.3, 설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 유튜브 자체 UI는 지울 수 없으므로 다섯 겹으로 가린다: 크롭·축소(위 상수),
 * playlist 파라미터 제거(⏮⏭가 재생목록 UI라서 생긴다 — 루프는 이 훅이
 * 되감아 처리한다), 시작 직후의 마스크, 그리고 재생이 걸리는 순간을 덮는
 * 우리 가운데 표시.
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
  // 재생이 걸리는 순간 유튜브가 자기 글리프를 그린다. 그동안만 우리 표시를
  // 띄워 그 자리를 덮는다 — 멈출 때는 상시 ▶ 표시가 이미 덮고 있다.
  const [covering, setCovering] = useState(false);
  const wasPlaying = useRef(false);

  useEffect(() => {
    if (playing) setHasPlayed(true);
  }, [playing]);

  useEffect(() => {
    const resumed = playing && !wasPlaying.current;
    wasPlaying.current = playing;
    if (!resumed) return;
    setCovering(true);
    const id = window.setTimeout(() => setCovering(false), YT_GLYPH_MS);
    return () => window.clearTimeout(id);
  }, [playing]);

  useEffect(() => {
    const id = window.setTimeout(() => setGraceOver(true), AUTOPLAY_GRACE_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hasPlayed) return;
    const id = window.setTimeout(() => setMasked(false), POSTER_HOLD_MS);
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
        className={PLAYER}
      />
    );
  }

  return (
    <>
      {/* API가 이 div 안에 iframe을 만든다. 크롭은 그 자식에게 건다. */}
      <div
        ref={mountRef}
        className="absolute inset-0 [&>iframe]:pointer-events-none [&>iframe]:absolute [&>iframe]:top-1/2 [&>iframe]:left-1/2 [&>iframe]:h-[calc(300%+720px)] [&>iframe]:w-[300%] [&>iframe]:-translate-x-1/2 [&>iframe]:-translate-y-1/2 [&>iframe]:scale-[0.3334] [&>iframe]:border-0"
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
        flash={covering}
      />
    </>
  );
}
