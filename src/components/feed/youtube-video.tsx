"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MuteButton } from "@/components/feed/mute-button";
import { useYoutubePlayer } from "@/components/feed/use-youtube-player";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

/**
 * 썸네일 마스크를 잡아 두는 시간. 플레이어가 첫 프레임을 그리기 전의 검은
 * 화면만 가린다 — 짧게 잡는다.
 */
const POSTER_HOLD_MS = 700;

/**
 * 유튜브 크롬 띠를 화면 밖으로 밀어내는 크롭.
 *
 * 상단 제목·채널 바와 하단 "동영상 더보기"·로고 바는 iframe의 위아래 끝에
 * 그려지므로, 위아래로 120px씩 키우면 article의 overflow-hidden이 잘라낸다.
 * 플레이어는 영상을 iframe 중앙에 맞추므로 세로로만 키우고 같은 양을 위로
 * 당기면 영상의 위치·크기는 변하지 않는다.
 *
 * 배율은 1배다 — 한때 3배로 만들어 CSS로 축소해 유튜브 UI를 작게 만들었지만,
 * 이제 재생/일시정지를 플레이어 자체 버튼이 맡으므로 정상 크기여야 눌린다.
 * 같은 이유로 pointer-events도 막지 않는다.
 *
 * iframe은 replaced 요소라 top·bottom만 주면 늘어나지 않고 기본 150px로
 * 돌아간다 — 높이를 직접 준다.
 */
const CROP = "absolute inset-x-0 -top-30 h-[calc(100%+240px)] w-full border-0";

/**
 * 유튜브 영상 게시물 재생기 (PRD §5.3, 설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 재생/일시정지는 **플레이어 자체 UI**가 맡는다 — 유튜브의 상태 전환 글리프는
 * 끌 수 없고(그런 파라미터가 없다) 가리는 것도 약관 위반이라, 우리 버튼을
 * 겹쳐 놓고 싸우는 대신 주체를 넘겼다. 우리가 남기는 것은 음소거
 * 버튼(controls=0에서는 유튜브가 음소거 UI를 주지 않는다)과 뷰포트 연동
 * 재생·루프뿐이다. mp4와의 모양은 MuteButton과 가운데 원형 글리프라는
 * 구성으로 맞춘다.
 */
export function YoutubeVideo({
  videoId,
  active,
}: {
  videoId: string;
  active: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { failed, playing, muted, toggleMute } = useYoutubePlayer({
    videoId,
    active,
    mountRef,
  });

  // 마스크는 플레이어 생성 직후 한 번만 쓴다. hasPlayed는 false→true로만
  // 바뀌므로 타이머 효과가 한 번만 돈다.
  const [hasPlayed, setHasPlayed] = useState(false);
  const [masked, setMasked] = useState(true);

  useEffect(() => {
    if (playing) setHasPlayed(true);
  }, [playing]);

  useEffect(() => {
    if (!hasPlayed) return;
    const id = window.setTimeout(() => setMasked(false), POSTER_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [hasPlayed]);

  // API 스크립트가 막혔다 — 음소거 버튼 없이 파라미터 임베드로 되돌린다.
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
        className="absolute inset-0 [&>iframe]:absolute [&>iframe]:inset-x-0 [&>iframe]:-top-30 [&>iframe]:h-[calc(100%+240px)] [&>iframe]:w-full [&>iframe]:border-0"
      />

      {/*
        시작 마스크. 영상이 레터박스로 들어가므로 검정 바탕 + object-contain.
        pointer-events-none — 첫 탭이 플레이어에 그대로 닿아야 한다.
      */}
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

      <MuteButton muted={muted} onToggle={toggleMute} />
    </>
  );
}
