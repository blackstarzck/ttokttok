import { Play } from "lucide-react";
import { AssetSlot } from "@/components/about/asset-slot";
import { DragScroll } from "@/components/about/drag-scroll";
import { BLEED, Chip } from "@/components/about/primitives";
import { StoryBarsAuto } from "@/components/about/story";
import { cn } from "@ttokttok/ui/utils";

const GENRES = ["소설", "시", "수필", "희곡", "동화", "평론", "그 외"];

type Card = {
  title: string;
  chips: string[];
  wide?: boolean;
  layout: "image-top" | "image-bottom" | "logo";
  /** 참고 사이트의 스토리 진행 막대 수 — 있는 카드만 5초마다 넘어간다. */
  story?: number;
};

const CARDS: Card[] = [
  {
    title: "카드 게시물",
    chips: ["훅", "도서 소개", "인용구"],
    layout: "image-top",
    story: 2,
  },
  {
    title: "릴스",
    chips: ["세로 영상", "음소거 시작", "도서 링크", "이어보기"],
    layout: "image-bottom",
  },
  {
    title: "EPUB 뷰어",
    chips: ["글꼴", "배경", "행간", "진행률", "이어읽기"],
    wide: true,
    layout: "image-top",
  },
  {
    title: "도서 상세",
    chips: ["소개", "인용구", "목차"],
    layout: "logo",
    story: 3,
  },
  { title: "탐색", chips: ["장르", "급상승", "검색"], layout: "image-top" },
  {
    title: "보관함",
    chips: ["찜", "완독", "이어읽기"],
    layout: "image-bottom",
  },
];

/**
 * 히어로 아래의 서비스 카드 띠. 참고 사이트는 화살표 없이 마우스로 끌어 옮기는
 * free-mode 스와이퍼이고(스냅 없음), 데스크톱에서는 첫 카드가 왼쪽에 살짝 걸친
 * 채 시작한다. 카드 328×440, 간격 12, 라운딩 28은 참고 사이트 실측값이다.
 */
export function ServicesStrip() {
  return (
    <section id="screens" aria-label="똑똑의 화면" className="pb-16 md:pb-24">
      <DragScroll
        startAtSecond
        className={cn(
          "flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          BLEED,
        )}
      >
        <article className="bg-muted flex h-[27.5rem] w-[17rem] shrink-0 flex-col rounded-[1.75rem] p-6">
          <h3 className="text-xl leading-snug font-medium break-keep">
            읽을 수 있는
            <br />
            장르
          </h3>
          <ul className="text-muted-foreground mt-auto space-y-2.5 text-sm">
            {GENRES.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </article>

        {CARDS.map((card) => (
          <article
            key={card.title}
            className={cn(
              "bg-foreground text-background relative flex h-[27.5rem] shrink-0 flex-col overflow-hidden rounded-[1.75rem] p-6",
              card.wide
                ? "w-[85vw] sm:w-[36rem] lg:w-[41rem]"
                : "w-[80vw] sm:w-[20.5rem]",
            )}
          >
            {card.story ? (
              <StoryBarsAuto count={card.story} className="mb-4" />
            ) : null}

            {card.layout === "image-bottom" ? (
              <h3 className="text-xl leading-snug font-medium break-keep">
                {card.title}
              </h3>
            ) : null}

            {card.layout === "logo" ? (
              <div className="grid flex-1 place-items-center">
                <AssetSlot tone="dark" className="h-16 w-44 rounded-xl" />
              </div>
            ) : (
              <AssetSlot
                tone="dark"
                className={cn(
                  "flex-1 rounded-2xl",
                  card.layout === "image-bottom" && "mt-5",
                )}
              />
            )}

            {card.layout !== "image-bottom" ? (
              <h3 className="mt-5 text-xl leading-snug font-medium break-keep">
                {card.title}
              </h3>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.chips.map((c) => (
                <Chip key={c} tone="dark">
                  {c}
                </Chip>
              ))}
            </div>

            {card.wide ? (
              <span
                aria-hidden
                className="bg-background/20 absolute right-6 bottom-6 grid size-16 place-items-center rounded-full backdrop-blur"
              >
                <Play className="size-6 fill-current" />
              </span>
            ) : null}
          </article>
        ))}
      </DragScroll>
    </section>
  );
}
