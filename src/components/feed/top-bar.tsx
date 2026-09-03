import Link from "next/link";
import { Bell } from "lucide-react";
import { UnreadBadge } from "@/components/feed/unread-badge";
import { CHROME_ACTION, CHROME_ICON } from "@/components/feed/chrome";

/**
 * 홈 상단 오버레이 바 (설계 결정 12).
 *
 * 구조적 형제가 아니라 **크롬 레이어**(z-[3])다 — §11-27이 "홈의 구조적
 * 형제는 하단 액션 바와 컨텐츠 영역 둘뿐"이라고 정했고, 구조적 헤더를
 * 넣으면 스냅 높이가 바뀌어 전면감이 깨진다. 인스타 릴스도 상단 요소를
 * 오버레이로 얹는다.
 *
 * 홈 전용이다. 탐색·프로필은 자체 헤더가 있거나 필요 없다.
 */
export function TopBar({ isGuest }: { isGuest: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-[3] flex h-14 items-center justify-between px-3">
      <span className="feed-chrome-text text-base font-bold text-white">
        똑똑
      </span>

      <Link
        href={isGuest ? "/login?next=/notifications" : "/notifications"}
        aria-label="알림"
        className={`${CHROME_ACTION} relative`}
      >
        <Bell className={CHROME_ICON} aria-hidden />
        {isGuest ? null : <UnreadBadge />}
      </Link>
    </header>
  );
}
