"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 채널 링크 공유. `CardActions.handleShare`와 같은 순서 — Web Share가 있으면
 * 시트, 없으면 클립보드 + 토스트. 카운터는 올리지 않는다(`share_count`는
 * 게시물 단위, 채널에는 대응 컬럼이 없다).
 *
 * 이 파일이 히어로에서 유일한 클라이언트 컴포넌트다 — 나머지는 서버에서
 * 그린다(FRONTEND.md §2).
 */
export function ChannelShareButton({
  slug,
  name,
  className,
}: {
  slug: string;
  name: string;
  className?: string;
}) {
  async function handleShare() {
    const url = `${window.location.origin}/channel/${slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크를 복사했어요");
      }
    } catch {
      // 사용자가 공유 시트를 닫았거나 클립보드가 막혔다 — 조용히 둔다.
    }
  }

  return (
    <button type="button" onClick={handleShare} className={className}>
      <Share2 className="size-4" aria-hidden />
      채널 공유
    </button>
  );
}
