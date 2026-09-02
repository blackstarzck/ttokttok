"use client";

import { Play, Volume2, VolumeX } from "lucide-react";

/**
 * 재생기 두 종류(업로드 mp4 / 유튜브 임베드)가 공통으로 만들어 내는 조작.
 * 이 네 개면 컨트롤 UI를 그릴 수 있고, UI는 소스가 무엇인지 알 필요가 없다.
 */
export type VideoControls = {
  playing: boolean;
  muted: boolean;
  togglePlay: () => void;
  toggleMute: () => void;
};

/**
 * 영상 게시물의 컨트롤 한 벌 (설계:
 * docs/superpowers/specs/2026-09-02-video-controls-design.md).
 *
 * 탭 레이어가 두 일을 겸한다: 화면 탭으로 재생/일시정지, 그리고 유튜브
 * iframe으로 가는 포인터 삼키기. iframe에 pointer-events:none만 주는 것으로는
 * 못 막는다 — 크로스 오리진 iframe은 별도 프로세스라 브라우저가 히트 테스트를
 * 건너뛰고 이벤트를 그대로 넘기는 경로가 있다 (실측).
 *
 * z: 탭 레이어는 z 없음(본문층, iframe 위) — 액션 레일·도서 바(z-3)의 탭을
 * 가로채지 않는다. 가운데 표시와 음소거 버튼은 스크림(z-2) 위여야 하므로 z-3.
 */
export function VideoChrome({
  playing,
  muted,
  togglePlay,
  toggleMute,
  busy = false,
}: VideoControls & {
  /**
   * 아직 재생이 시작될지 판정되지 않은 구간. 가운데 표시를 유보한다 —
   * 안 그러면 게시물에 진입할 때마다 ▶ 가 잠깐 깜빡였다 사라진다.
   */
  busy?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "일시정지" : "재생"}
        className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset focus-visible:outline-none"
      />

      {/* 멈춘 동안에만. pointer-events-none — 탭 레이어가 계속 포인터를 받아야 한다. */}
      {playing || busy ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="size-7 fill-current" />
          </span>
        </span>
      )}

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "소리 켜기" : "소리 끄기"}
        // 상단에는 스크림이 없다. 크롬 중 유일하게 자기 배경을 갖는 요소이고,
        // 그림자만으로는 밝은 영상 프레임에서 부족하다.
        className="absolute top-3.5 right-3.5 z-[3] flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 focus-visible:outline-none"
      >
        {muted ? (
          <VolumeX className="size-5" aria-hidden />
        ) : (
          <Volume2 className="size-5" aria-hidden />
        )}
      </button>
    </>
  );
}
