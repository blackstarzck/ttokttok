import { Sparkles } from "lucide-react";
import { AssetSlot } from "@/components/about/asset-slot";
import {
  Chip,
  Container,
  DarkButton,
  Surface,
} from "@/components/about/primitives";
import { RotatingWord } from "@/components/about/rotating-word";
import { cn } from "@ttokttok/ui/utils";

const TABS = ["카드 게시물", "릴스", "탐색", "보관함"];

const CARDS: { title: string; chips: string[]; span: 2 | 3 }[] = [
  { title: "카드 게시물", chips: ["훅", "도서 소개", "인용구", "부연 설명"], span: 3 },
  { title: "릴스", chips: ["세로 영상", "음소거 시작", "도서 링크", "이어보기"], span: 3 },
  { title: "도서 상세 시트", chips: ["소개", "인용구", "목차"], span: 2 },
  { title: "EPUB 뷰어", chips: ["글꼴", "배경", "진행률"], span: 2 },
  { title: "탐색", chips: ["장르", "급상승", "검색"], span: 2 },
  { title: "보관함", chips: ["찜", "완독", "이어읽기"], span: 3 },
  { title: "채널", chips: ["아바타", "장르", "게시물"], span: 3 },
  { title: "알림", chips: ["댓글", "좋아요", "읽음"], span: 2 },
  { title: "링크형 도서", chips: ["서점 링크", "ISBN", "미리보기 없음"], span: 2 },
  { title: "테마", chips: ["라이트", "다크", "시스템"], span: 2 },
];

/**
 * 참고 사이트 "One subscription. Every design capability" — 왼쪽 탭 카드,
 * 오른쪽 기능 벤토 10개. 카드 이미지 자리는 호버하면 두 번째 자리가 0.25s로
 * 덮어 올라온다(참고 사이트의 `.product-hover-image` 페이드).
 */
export function Capabilities() {
  return (
    <Surface tone="white" id="capabilities">
      <Container className="py-16 md:py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="text-4xl leading-[1.1] font-medium tracking-tight break-keep md:text-5xl">
              하나의{" "}
              <AssetSlot className="inline-block size-10 rounded-xl align-[-0.15em]" />
              <br />
              피드.
              <br />
              모든{" "}
              <RotatingWord
                fast
                words={["발견", "탐색", "추천", "기록"]}
                className="text-foreground/35"
              />
              <br />
              방식
            </h2>

            <div className="border-border/60 bg-card relative mt-10 overflow-hidden rounded-[2rem] border p-2">
              <ul className="bg-muted/60 rounded-[1.5rem] p-1.5 text-sm">
                {TABS.map((tab, i) => (
                  <li
                    key={tab}
                    className={cn(
                      "flex items-center gap-2 rounded-2xl px-4 py-3",
                      i === 0 ? "bg-card font-medium" : "text-muted-foreground",
                    )}
                  >
                    {i === 0 ? <Sparkles className="size-4" aria-hidden /> : null}
                    {tab}
                  </li>
                ))}
              </ul>
              <AssetSlot className="-mx-2 -mb-2 mt-6 h-44" />
              <DarkButton
                href="/"
                className="absolute inset-x-6 bottom-6 h-12 text-sm"
              >
                시작하기
              </DarkButton>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-6">
            {CARDS.map((card) => (
              <article
                key={card.title}
                className={cn(
                  "group border-border/60 bg-card rounded-[1.75rem] border p-4 md:p-5",
                  card.span === 3 ? "md:col-span-3" : "md:col-span-2",
                )}
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl">
                  <AssetSlot className="absolute inset-0" />
                  <AssetSlot
                    tone="inset"
                    className="absolute inset-0 opacity-0 transition-opacity duration-[250ms] ease-out group-hover:opacity-100"
                  />
                </div>
                <p className="mt-5 text-xl font-medium">{card.title}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.chips.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </Surface>
  );
}
