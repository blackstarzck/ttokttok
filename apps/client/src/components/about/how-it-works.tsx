import { AssetSlot } from "@/components/about/asset-slot";
import { Container, SectionTitle, Surface } from "@/components/about/primitives";
import { StepsAccordion, type Step } from "@/components/about/steps-accordion";

const STEPS: readonly Step[] = [
  {
    title: "피드를 넘긴다",
    body: "홈은 곧바로 카드 피드입니다. 훅 한 줄, 소개 몇 줄 — 카드 한 장이 책 한 권입니다.",
    cta: "홈으로",
    href: "/",
  },
  {
    title: "마음이 가는 카드를 탭한다",
    body: "도서 상세 시트에 소개·인용구·목차가 열립니다. 전문이 있으면 「바로 읽기」가 기다립니다.",
    cta: "탐색하기",
    href: "/discover",
  },
  {
    title: "그 자리에서 첫 장을 읽는다",
    body: "EPUB 뷰어가 바로 열립니다. 글꼴·배경·행간은 한 번 고르면 기억됩니다.",
    cta: "책 고르기",
    href: "/discover",
  },
  {
    title: "이어 읽고 보관한다",
    body: "어디까지 읽었는지는 기기가 기억하고, 로그인하면 보관함과 함께 계정에도 남습니다.",
    cta: "로그인",
    href: "/login",
  },
];

/**
 * 참고 사이트 "How it works" — 왼쪽 4단계 탭식 아코디언(항상 하나 열림), 오른쪽
 * 이미지 자리. 열린 카드 높이가 고정이라(StepsAccordion) 목록 전체 높이는 어떤
 * 단계가 열려도 같고, 오른쪽 자리는 그리드 stretch로 그 높이에 정확히 맞는다 —
 * 둘의 아랫선이 항상 한 줄이고, 여닫아도 움직이지 않는다.
 */
export function HowItWorks() {
  return (
    <Surface tone="white">
      <Container className="py-16 md:py-24">
        <SectionTitle className="text-center">이렇게 읽습니다</SectionTitle>
        <p className="text-muted-foreground mt-4 text-center text-lg break-keep">
          검색도 설치도 결제도 건너뜁니다.
          <br />
          바로 읽는 데로 갑니다
        </p>

        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
          <StepsAccordion steps={STEPS} />
          {/* lg에서 높이를 두지 않아 그리드가 목록 높이로 늘린다. */}
          <AssetSlot className="h-[20rem] rounded-[2rem] lg:h-auto" />
        </div>
      </Container>
    </Surface>
  );
}
