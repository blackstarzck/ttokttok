"use client";

import { Volume2, VolumeX } from "lucide-react";

/**
 * 음소거 토글 — mp4·유튜브 게시물이 공유하는 유일한 재생 컨트롤이다.
 *
 * 재생/일시정지는 유형마다 주체가 다르다(mp4는 우리 탭 레이어, 유튜브는
 * 플레이어 자체 버튼). 반면 음소거는 유튜브가 `controls=0`에서 UI를 주지
 * 않으므로 우리가 양쪽에 같은 버튼을 둔다 — 이 파일이 두 유형의 모양을
 * 맞추는 지점이라, 여기 스타일을 고치면 양쪽이 함께 바뀐다.
 */
export function MuteButton({
  muted,
  onToggle,
}: {
  muted: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
  );
}
