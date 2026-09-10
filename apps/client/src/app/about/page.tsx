import type { Metadata } from "next";
import { AboutNav } from "@/components/about/about-nav";
import { Hero } from "@/components/about/hero";
import { ServicesStrip } from "@/components/about/services-strip";
import { PlanFinder } from "@/components/about/plan-finder";
import { Showcase } from "@/components/about/showcase";
import { Friction } from "@/components/about/friction";
import { WorksCarousel } from "@/components/about/works-carousel";
import { WhyBento } from "@/components/about/why-bento";
import { ProjectsCarousel } from "@/components/about/projects-carousel";
import { Capabilities } from "@/components/about/capabilities";
import { GrassCta } from "@/components/about/grass-cta";
import { QuotesWall } from "@/components/about/quotes-wall";
import { HowItWorks } from "@/components/about/how-it-works";
import { RightsFunnel } from "@/components/about/rights-funnel";
import { FinalCta } from "@/components/about/final-cta";
import { Faq } from "@/components/about/faq";
import { ReadingList } from "@/components/about/reading-list";

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

/**
 * 소개 랜딩. awesomic.com 홈의 섹션 순서·비율을 그대로 따르고(설계:
 * `docs/superpowers/specs/2026-09-10-about-awesomic-clone-design.md`), 에셋
 * 자리는 비워 둔다. 데이터 조회가 없는 정적 페이지다.
 *
 * 흰 면(`bg-card`)과 회색 면(`bg-background`)이 둥근 위 모서리로 번갈아
 * 겹친다 — `Surface`가 앞 섹션 위로 3rem 올라오므로 순서가 곧 레이아웃이다.
 */
export default function AboutPage() {
  return (
    <div className="bg-card text-foreground min-h-dvh">
      <AboutNav />
      <main>
        <Hero />
        <ServicesStrip />
        <PlanFinder />
        <Showcase />
        <Friction />
        <WorksCarousel />
        <WhyBento />
        <ProjectsCarousel />
        <Capabilities />
        <GrassCta />
        <QuotesWall />
        <HowItWorks />
        <RightsFunnel />
        <FinalCta />
        <Faq />
        <ReadingList />
      </main>
    </div>
  );
}
