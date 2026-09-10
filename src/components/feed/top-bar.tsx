import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Bell } from "lucide-react";
import { UnreadBadge } from "@/components/feed/unread-badge";

/**
 * 홈 상단 헤더 (설계 결정 8, IA 결정 기록 §11-53).
 *
 * **구조적 형제**다 — `page.tsx`가 `CardFeed`와 나란히 flex로 쌓고,
 * `absolute` 오버레이가 아니다. 원래는 크롬 레이어(z-[3])였다 — §11-27이
 * "홈의 구조적 형제는 하단 액션 바와 컨텐츠 영역 둘뿐"이라 정했고, 홈이
 * 전면 스냅 피드였을 때는 구조적 헤더를 넣으면 스냅 높이가 바뀌었기
 * 때문이다. 홈이 카드 목록이 되며 그 전제가 사라졌는데도 오버레이로
 * 남아 있던 탓에, 카드 목록에는 전면 피드의 CHROME_SAFE_AREA 같은 회피
 * 장치가 없어 이 바가 위 56px 띠의 탭을 전부 삼켰다 — 카드의 읽기 CTA를
 * 누르면 알림 종이, 채널 헤더를 누르면 이 바 자신이 잡혔다(사전 병합
 * 리뷰 Critical 1). 그래서 구조적 헤더로 옮겼다.
 *
 * 카드 표면(불투명한 `background`) 위에 앉으므로 시맨틱 토큰을 쓴다 —
 * 흰색 고정 크롬 예외(DESIGN.md Colors)는 임의의 콘텐츠 픽셀 위 오버레이
 * 에만 적용되고, 이 바는 이제 그 범위 밖이다. `UnreadBadge`도 같은
 * 이유로 시맨틱 토큰을 쓴다.
 *
 * 홈 전용이다. 릴스는 전면 피드라 상단 바가 없다(결정 8) — 탐색·프로필은
 * 자체 헤더가 있거나 필요 없다.
 *
 * 비로그인일 때만 「소개」(`/about`)가 붙는다 — 이미 쓰고 있는 사람에게
 * 소개를 권할 이유가 없다. 소개 페이지는 `(main)` 그룹 밖이라 이 바를
 * 공유하지 않고 자기 상단 바를 갖는다.
 */
export function TopBar({ isGuest }: { isGuest: boolean }) {
  return (
    <header className="border-border bg-background flex h-14 shrink-0 items-center justify-between border-b px-3">
      <BrandLogo />

      {/* gap-2(8px)여야 한다 — DESIGN.md Layout의 "인접 타깃 간 8px 이상".
          gap-1(4px)로 두었다가 회귀 검사에서 걸렸다. 예외는 BottomNav 하나뿐
          이고 그 예외를 헤더로 넓히지 않는다. */}
      <div className="flex items-center gap-2">
        {isGuest ? (
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            소개
          </Link>
        ) : null}

        <Link
          href={isGuest ? "/login?next=/notifications" : "/notifications"}
          aria-label="알림"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bell className="size-6" aria-hidden />
          {isGuest ? null : <UnreadBadge />}
        </Link>
      </div>
    </header>
  );
}
