import Link from "next/link";

/**
 * 화면이 통째로 뜨지 못했을 때 (조회 실패).
 *
 * `not-found.tsx`와 짝을 이룬다 — 그쪽은 "정말 없는 것", 이쪽은 "불러오지
 * 못한 것"이다. 둘을 같은 화면으로 보여주면 앱이 거짓말을 한다: 멀쩡히 있는
 * 채널을 사용자가 지워진 것으로 믿게 된다(§11-55가 피드·알림에서 세운 규약을
 * 화면 전체 단위로 옮긴 것).
 *
 * 목록 안에서 일부만 실패한 경우에는 쓰지 않는다 — 그때는 그 자리의 문구만
 * 바꾼다(알림 화면·CardFeed의 선례). 화면을 통째로 지울 이유가 없다.
 *
 * GNB를 그대로 두는 이유도 같다: 사용자가 다른 탭으로 빠져나갈 길을 남긴다.
 * 이 컴포넌트는 `(main)` 레이아웃 안에서 렌더되므로 GNB는 레이아웃이 갖는다.
 */
export function LoadFailed({
  message = "불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
}: {
  message?: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
      <p className="text-muted-foreground text-center text-sm break-keep">
        {message}
      </p>
      <Link
        href="/"
        className="text-foreground text-sm underline underline-offset-2"
      >
        홈으로
      </Link>
    </div>
  );
}
