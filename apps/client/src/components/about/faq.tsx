import { ChevronDown } from "lucide-react";
import { AssetSlot, AvatarStack } from "@/components/about/asset-slot";
import { Container, DarkButton, Surface } from "@/components/about/primitives";

const FAQ = [
  {
    q: "똑똑이 뭔가요?",
    a: "숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 모바일 웹 서비스입니다. 세로로 넘기는 피드에 도서 소개 카드와 짧은 영상이 흐르고, 관심이 생기면 곧바로 EPUB 뷰어가 열립니다.",
  },
  {
    q: "정말 무료인가요?",
    a: "네. 결제도 구독도 없습니다. 전문을 제공하는 책은 저작권이 만료된 작품이라 비용을 받을 이유가 없습니다.",
  },
  {
    q: "어떻게 전문을 제공할 수 있나요?",
    a: "1962년 이전에 사망한 저작자의 작품은 개정 전 기준(사후 50년)으로 보호기간이 끝났습니다. 본문은 위키문헌에서 수급하고, 저작자의 사망 연도와 국적을 확인한 뒤 등록합니다. 해외 고전은 번역자의 저작권이 남아 있어 전문을 제공하지 않습니다.",
  },
  {
    q: "로그인 없이도 읽을 수 있나요?",
    a: "네. 피드·탐색·뷰어는 게스트도 전부 씁니다. 로그인은 보관함과 이어읽기를 기기 사이에서 이어 갈 때 필요합니다.",
  },
  {
    q: "링크형 도서는 뭔가요?",
    a: "본문을 갖고 있지 않은 인기 도서입니다. 소개 카드와 서점 구매 링크까지만 보여드리고, 미리보기나 발췌는 없습니다.",
  },
  {
    q: "어디까지 읽었는지 기억하나요?",
    a: "뷰어가 진행률을 기억합니다. 로그인하면 계정에도 남아 다른 기기에서 이어 읽습니다.",
  },
  {
    q: "다크 모드가 있나요?",
    a: "있습니다. 프로필에서 라이트·다크·시스템을 고르면 앱 전체와 이 페이지가 함께 바뀝니다.",
  },
];

/** 참고 사이트 FAQ — 왼쪽 제목·AI 요약 아이콘 5개·질문 카드, 오른쪽 아코디언 7개. */
export function Faq() {
  return (
    <Surface tone="white" id="faq">
      <Container className="py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col">
            <h2 className="text-4xl font-medium tracking-tight md:text-5xl">FAQ</h2>
            <p className="text-muted-foreground mt-6">AI에게 똑똑을 요약해 달라고 하세요</p>
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className="bg-muted grid size-12 place-items-center rounded-2xl"
                >
                  <AssetSlot tone="inset" className="size-5 rounded-sm" />
                </span>
              ))}
            </div>

            <div className="border-border/60 bg-card mt-16 max-w-[17rem] rounded-[1.75rem] border p-6 lg:mt-auto">
              <p className="text-xl font-medium break-keep">더 궁금한 게 있나요?</p>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed break-keep">
                피드를 열어 보는 게 가장 빠른 답입니다 — 카드 한 장, 30초.
              </p>
              <DarkButton href="/" className="mt-5 h-11 text-sm">
                피드 열기 <AvatarStack className="text-[1.15em]" />
              </DarkButton>
            </div>
          </div>

          <div className="grid content-start gap-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                name="faq"
                className="details-animate group bg-muted rounded-[1.75rem]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-6 text-xl font-medium break-keep [&::-webkit-details-marker]:hidden md:px-7 md:text-2xl">
                  <span>{item.q}</span>
                  <span className="bg-foreground text-background grid size-7 shrink-0 place-items-center rounded-full transition-transform group-open:rotate-180">
                    <ChevronDown className="size-4" aria-hidden />
                  </span>
                </summary>
                <p className="text-muted-foreground px-6 pb-7 leading-relaxed break-keep md:px-7">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </Surface>
  );
}
