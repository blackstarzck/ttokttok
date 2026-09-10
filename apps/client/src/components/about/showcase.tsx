import { AssetSlot } from "@/components/about/asset-slot";
import { Container } from "@/components/about/primitives";
import { QUOTES } from "@/components/about/quotes";
import { QuoteRotator } from "@/components/about/quote-rotator";
import { ShowcaseStory, type ShowcaseSlide } from "@/components/about/story";

const FEATURED = [
  { title: "날개", meta: "이상 · 1936 · 단편소설", time: "약 40분" },
  {
    title: "메밀꽃 필 무렵",
    meta: "이효석 · 1936 · 단편소설",
    time: "약 20분",
  },
];

/** 큰 카드가 5초마다 넘기는 문장 넷 — 참고 사이트의 케이스 4장에 대응한다. */
const SLIDES: readonly ShowcaseSlide[] = [
  { line1: "하루 한 장이면", line2: "한 달에 한 권", caption: "이어읽기" },
  { line1: "카드 한 장이", line2: "첫 장이 됩니다", caption: "카드 피드" },
  { line1: "검색하지 않아도", line2: "책이 먼저 노크", caption: "릴스" },
  { line1: "글꼴도 배경도", line2: "뷰어가 기억", caption: "EPUB 뷰어" },
];

/** 참고 사이트의 케이스 스터디 블록 — 큰 검정 카드 + 통계 카드 2개 + 후기 카드. */
export function Showcase() {
  return (
    <Container className="pb-16 md:pb-24">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.19fr)_minmax(0,1fr)]">
        <article className="bg-foreground text-background relative flex min-h-[34rem] flex-col overflow-hidden rounded-[2rem] p-8">
          <ShowcaseStory slides={SLIDES} />
          <AssetSlot
            tone="dark"
            className="mx-4 mt-auto -mb-8 h-52 rounded-t-2xl md:mx-8"
          />
        </article>

        <div className="grid content-start gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURED.map((book) => (
              <article
                key={book.title}
                className="bg-muted rounded-[1.75rem] p-6"
              >
                <div className="flex items-center gap-3">
                  <AssetSlot className="bg-foreground/10 size-9 rounded-xl" />
                  <p className="text-xl font-medium">{book.title}</p>
                </div>
                <p className="text-muted-foreground mt-3 text-sm">
                  {book.meta}
                </p>
                <p className="text-muted-foreground mt-10 text-sm">
                  읽는 시간:
                </p>
                <p className="text-4xl font-medium tracking-tight">
                  {book.time}
                </p>
              </article>
            ))}
          </div>
          <QuoteRotator quotes={QUOTES.slice(0, 4)} />
        </div>
      </div>
    </Container>
  );
}
