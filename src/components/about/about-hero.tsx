import Link from "next/link";
import { SampleCard } from "@/components/about/sample-card";
import type { FeedPost } from "@/lib/feed";

/**
 * 텍스트 왼쪽, 실제 카드 오른쪽의 비대칭 split.
 *
 * 폰트 스케일이 `md:text-5xl`에서 멈추는 것은 의도다. 한글은 라틴 문자보다
 * 자당 폭이 두 배 가까워, 20자 헤드라인을 `text-6xl`(60px)로 두면 608px
 * 컬럼에서 3줄이 된다. `text-5xl`(48px)이 2줄의 상한이다.
 */
export function AboutHero({ post }: { post: FeedPost | null }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-14 pb-20 md:pt-24 md:pb-28">
      <div className="grid items-center gap-12 md:gap-16 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div>
          <h1 className="max-w-[38rem] text-3xl leading-[1.2] font-bold tracking-tight text-balance break-keep sm:text-4xl md:text-5xl">
            읽을 생각 없이 열어도, 첫 장이 열립니다
          </h1>
          <p className="text-muted-foreground mt-6 max-w-[34rem] text-base leading-relaxed break-keep md:text-lg">
            숏폼처럼 넘기다 마음이 가는 책을 만나면, 그 자리에서 바로 읽기
            시작합니다. 설치도 결제도 없습니다.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-12 items-center rounded-md px-6 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
            >
              피드 열기
            </Link>
            <Link
              href="/discover"
              className="bg-secondary text-secondary-foreground hover:bg-accent focus-visible:ring-ring inline-flex min-h-12 items-center rounded-md px-6 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
            >
              도서 목록 보기
            </Link>
          </div>
        </div>

        {post ? (
          <div className="lg:justify-self-end">
            <SampleCard post={post} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
