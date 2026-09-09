import Link from "next/link";

/**
 * 라벨이 상단 바·히어로와 같은 `피드 열기`다. 같은 의도에 문구를 여러 개
 * 두면 방문자가 서로 다른 곳으로 가는 줄 안다.
 *
 * 중앙 정렬을 쓰는 유일한 섹션이다 — 마지막에 남는 선택이 하나뿐이라
 * 시선을 나눌 이유가 없다.
 */
export function ClosingCta() {
  return (
    <section className="border-border border-t">
      <div className="mx-auto max-w-6xl px-5 py-24 text-center md:py-32">
        <h2 className="mx-auto max-w-[28rem] text-2xl font-bold tracking-tight text-balance break-keep md:text-4xl">
          읽을 책은 이미 피드에 있습니다
        </h2>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring mt-9 inline-flex min-h-12 items-center rounded-md px-7 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
        >
          피드 열기
        </Link>
      </div>
    </section>
  );
}
