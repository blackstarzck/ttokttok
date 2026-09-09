import type { Metadata } from "next";
import { getFeed } from "@/lib/feed";
import { getFeaturedBooks } from "@/lib/discover";
import { AboutNav } from "@/components/about/about-nav";
import { AboutHero } from "@/components/about/about-hero";
import { AboutLoop } from "@/components/about/about-loop";
import { BookStrip } from "@/components/about/book-strip";
import { RightsSection } from "@/components/about/rights-section";
import { ClosingCta } from "@/components/about/closing-cta";
import { AboutFooter } from "@/components/about/about-footer";

const DESCRIPTION =
  "숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 서비스, 똑똑을 소개합니다.";

export const metadata: Metadata = {
  // 루트 레이아웃의 template("%s · 똑똑")이 붙어 "소개 · 똑똑"이 된다.
  title: "소개",
  description: DESCRIPTION,
  openGraph: {
    title: "똑똑 소개",
    description: DESCRIPTION,
    type: "website",
  },
};

export default async function AboutPage() {
  // 방문마다 다른 카드가 걸리게 새 seed를 뽑는다 — 색을 도서 커버가 내는
  // 페이지라(설계 결정 3) 카드가 바뀌면 인상도 바뀐다.
  const seed = crypto.randomUUID();

  // sessionId에 null을 넘겨도 안전하다. `(main)/page.tsx`가 경고하는 문제는
  // 1페이지와 다음 페이지가 다른 세션 id로 점수를 계산해 같은 게시물이 두
  // 페이지에 겹치는 것인데, 여기는 1건만 받고 페이지네이션을 하지 않는다.
  const [cardFeed, featured] = await Promise.all([
    getFeed(seed, null, 1, null, "cards"),
    getFeaturedBooks(),
  ]);

  // 실패를 빈 값으로 삼키지 않는다 (FRONTEND.md §5). 카드를 못 구하면
  // 히어로가 텍스트 단독으로 좁혀 선다 — 히어로가 통째로 사라지면 페이지가
  // 제목 없이 시작한다.
  const samplePost = cardFeed.failed ? null : (cardFeed.posts[0] ?? null);
  // 조회가 실패했으면 섹션을 접는다 — 빈 목록을 그려 "추천 도서가 없다"고
  // 말하면 그건 정보가 아니라 거짓말이다.
  const featuredBooks = featured.failed ? [] : featured.books;

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <AboutNav />
      <main>
        <AboutHero post={samplePost} />
        <AboutLoop />
        <BookStrip books={featuredBooks} />
        <RightsSection />
        <ClosingCta />
      </main>
      <AboutFooter />
    </div>
  );
}
