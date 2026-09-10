import { ArrowUpRight } from "lucide-react";
import { AssetSlot } from "@/components/about/asset-slot";
import {
  Chip,
  Container,
  DarkButton,
  PulseChevrons,
  SectionTitle,
  SoftButton,
} from "@/components/about/primitives";
import { ToggleChips } from "@/components/about/toggle-chips";

const PLANS = [
  {
    name: "전문 도서",
    body: "1962년 이전에 사망한 저작자의 작품은 EPUB 전문을 그 자리에서 읽습니다. 글꼴·배경·진행률까지 뷰어가 기억합니다.",
    price: "무료",
    unit: "/전권",
    href: "/discover",
  },
  {
    name: "링크형 도서",
    body: "본문을 갖고 있지 않은 인기 도서는 소개 카드와 서점 구매 링크까지 보여드립니다. 미리보기 없이, 있는 그대로.",
    price: "0원",
    unit: "/소개",
    href: "/discover",
  },
  {
    name: "게스트 읽기",
    body: "로그인 없이도 피드·탐색·뷰어를 전부 씁니다. 로그인하면 보관함과 이어읽기가 기기 사이에서 이어집니다.",
    price: "무료",
    unit: "/로그인 없이",
    href: "/login",
  },
];

/** 참고 사이트 "Find the plan that fits how you build" — 왼쪽 토글 카드, 오른쪽 3행. */
export function PlanFinder() {
  return (
    <Container id="plans" className="pb-16 md:pb-24">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-8">
        <div>
          <SectionTitle>
            읽는 방식에 맞는
            <br />
            시작점을 고르세요
          </SectionTitle>

          <div className="border-border/60 bg-muted mt-8 rounded-[2rem] border p-2">
            <div className="bg-card rounded-[1.5rem] p-6">
              <p className="text-sm font-medium">지금 어디쯤인가요?</p>
              <ToggleChips
                label="지금 어디쯤인가요?"
                options={["처음이에요", "자주 읽어요"]}
                className="mt-3"
              />
              <p className="mt-6 text-sm font-medium">어떻게 고르고 싶나요?</p>
              <ToggleChips
                label="어떻게 고르고 싶나요?"
                options={["피드에서 발견", "목록에서 탐색"]}
                className="mt-3"
              />
              <DarkButton href="/" className="mt-8 h-14 w-full gap-3">
                <PulseChevrons dir="right" />
                피드 열기
                <PulseChevrons dir="left" />
              </DarkButton>
            </div>
          </div>
        </div>

        <ul className="grid content-start gap-4">
          {PLANS.map((plan) => (
            <li
              key={plan.name}
              className="border-border/60 bg-card rounded-[1.75rem] border p-6 md:p-7"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
                <div className="min-w-0">
                  <Chip>
                    <AssetSlot className="bg-foreground/20 size-4 rounded-full" />
                    {plan.name}
                  </Chip>
                  <p className="text-muted-foreground mt-4 leading-relaxed break-keep">
                    {plan.body}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <p className="text-lg whitespace-nowrap">
                    <span className="font-medium">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">
                      {plan.unit}
                    </span>
                  </p>
                  <SoftButton href={plan.href}>
                    자세히 <ArrowUpRight className="size-4" aria-hidden />
                  </SoftButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
