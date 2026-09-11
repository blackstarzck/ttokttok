import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@ttokttok/ui/utils";
import { ChannelShareButton } from "@/components/channel/channel-share-button";

/**
 * 히어로 하단의 두 칸 액션 바 (설계 §1.2).
 *
 * 한 필 안에 세로 구분선으로 두 칸을 나눈다 — 참고 화면의 구성이다.
 * 팔로우가 없는 이유: v2 보류(PRD §10). "영상 이어보기"는 채널 릴스
 * 뷰어의 첫 영상으로 간다(`start` 없음).
 *
 * `showVideos`가 false면 왼쪽 칸을 **숨긴다** — 영상 0건 채널에서 그
 * 링크를 살려두면 뷰어가 `notFound()`로 답하는 막다른 길이다. 카운트를
 * 못 읽어 모르는 경우도 같다.
 *
 * 흰색 고정·유리 외피는 커버 사진 위라서다 — 콘텐츠 픽셀 위 크롬 면제
 * (DESIGN.md Colors "채널 히어로 크롬").
 */
const CELL =
  "flex min-h-11 flex-1 items-center justify-center gap-2 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none";

export function ChannelActions({
  slug,
  name,
  showVideos,
}: {
  slug: string;
  name: string;
  showVideos: boolean;
}) {
  return (
    <div className="flex items-stretch rounded-full border border-white/40 bg-black/30 backdrop-blur-sm">
      {showVideos ? (
        <>
          <Link href={`/channel/${slug}/reels`} className={cn(CELL, "rounded-l-full")}>
            <Play className="size-4" aria-hidden />
            영상 이어보기
          </Link>
          <span aria-hidden className="my-2 w-px bg-white/40" />
        </>
      ) : null}
      <ChannelShareButton
        slug={slug}
        name={name}
        className={cn(CELL, "rounded-r-full", !showVideos && "rounded-l-full")}
      />
    </div>
  );
}
