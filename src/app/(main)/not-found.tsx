import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "페이지를 찾을 수 없어요" };

/**
 * (main) 그룹 전용 404.
 *
 * `(main)` 아래 어디서든 notFound()를 부르면(예: 채널을 못 찾거나 영상이
 * 없는 `/channel/[slug]/reels`) Next가 세그먼트 트리를 거슬러 올라가며
 * 가장 가까운 not-found.tsx를 찾는다 — 이 파일을 루트가 아니라 여기
 * 두는 이유가 그거다: `(main)/layout.tsx`(BottomNav 포함) 안에서
 * 렌더되어 앱 셸이 그대로 남는다. 이 파일이 없으면 Next 기본 404(영어,
 * 크롬 없음, 하단 내비게이션도 없어 돌아갈 길이 없음)로 샌다.
 *
 * getChannel(src/lib/channel.ts)이 에러를 삼키고 null을 돌려주는 문제는
 * 여기서 고치지 않는다 — "채널이 없다"와 "일시적 조회 실패"가 이 화면
 * 앞에서 구분되지 않는 채로 남는 잔여 결함이고, 데이터 계층을 손보는
 * 것은 이 브랜치보다 넓은 작업이다. 이 화면은 그 결과가 최소한 한국어로,
 * 앱 안에서, 돌아갈 길과 함께 보이게만 한다.
 */
export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-muted-foreground text-sm">
        페이지를 찾을 수 없어요.
      </p>
      <Link
        href="/"
        className="text-foreground text-sm underline underline-offset-2"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
