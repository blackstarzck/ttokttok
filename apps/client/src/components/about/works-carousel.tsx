import { AssetSlot } from "@/components/about/asset-slot";
import { Carousel } from "@/components/about/carousel";
import { Chip, Surface } from "@/components/about/primitives";

const WORKS = [
  { author: "이상", title: "날개", year: 1936, tags: ["단편소설", "경성", "모더니즘"] },
  { author: "이효석", title: "메밀꽃 필 무렵", year: 1936, tags: ["단편소설", "장터", "달밤"] },
  { author: "현진건", title: "운수 좋은 날", year: 1924, tags: ["단편소설", "경성", "사실주의"] },
  { author: "김유정", title: "동백꽃", year: 1936, tags: ["단편소설", "강원", "해학"] },
  { author: "김소월", title: "진달래꽃", year: 1925, tags: ["시집", "민요", "이별"] },
  { author: "한용운", title: "님의 침묵", year: 1926, tags: ["시집", "불교", "연가"] },
  { author: "심훈", title: "상록수", year: 1935, tags: ["장편소설", "농촌", "계몽"] },
];

/**
 * 참고 사이트의 인재 카드 캐러셀 자리 — 사진 자리 · 저자(작게) · 작품(크게)
 * · 장르 칩 · 게시 채널 로고 자리. 아래 잔디 띠 위로 다음 면이 올라온다.
 */
export function WorksCarousel() {
  return (
    <Surface tone="white" id="works">
      <div className="pt-16 md:pt-24">
        <Carousel
          heading={
            <h2 className="text-2xl font-medium tracking-tight break-keep md:text-3xl">
              왜 검색하나요? 책이 먼저 노크합니다
            </h2>
          }
        >
          {WORKS.map((work) => (
            <article
              key={work.title}
              className="w-[17rem] shrink-0 snap-start sm:w-[20.5rem]"
            >
              <AssetSlot className="aspect-square rounded-[2rem]" />
              <div className="mt-6 px-3">
                <p className="text-muted-foreground text-sm">{work.author}</p>
                <p className="mt-1 text-xl font-medium">
                  {work.title}
                  <span className="text-muted-foreground text-base font-normal">
                    , {work.year}
                  </span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {work.tags.map((t) => (
                    <Chip key={t}>{t}</Chip>
                  ))}
                </div>
                <p className="text-muted-foreground mt-6 text-sm">게시 채널</p>
                <AssetSlot className="mt-2 h-7 w-36 rounded-md" />
              </div>
            </article>
          ))}
        </Carousel>
        {/* 잔디 질감 띠 — 다음 면이 둥근 모서리로 이 위에 올라온다. */}
        <AssetSlot tone="inset" className="mt-16 h-40 w-full md:h-56" />
      </div>
    </Surface>
  );
}
