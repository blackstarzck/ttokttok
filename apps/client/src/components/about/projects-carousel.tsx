import { AssetSlot } from "@/components/about/asset-slot";
import { Carousel } from "@/components/about/carousel";
import { Surface } from "@/components/about/primitives";

const CHANNELS = [
  { name: "고전 다시 읽기", desc: "1930년대 단편을 한 장씩", count: "24편" },
  { name: "시 한 편", desc: "하루 한 편, 3분이면 충분한 시", count: "41편" },
  { name: "첫 문장 모음", desc: "첫 줄만 읽어도 좋은 책들", count: "18편" },
  { name: "장터와 달밤", desc: "향토 소설을 계절 따라", count: "12편" },
  { name: "경성 산책", desc: "모던 경성을 걷는 소설", count: "9편" },
  { name: "어린이 문학", desc: "방정환에서 시작하는 동화", count: "15편" },
];

/**
 * 참고 사이트 "20,000+ ideas became delivered projects"(큰 게시물 카드) 와
 * "We serve the best in the industry"(회사 카드) 두 캐러셀을 회색 면에 담는다.
 * 채널 이름·편수는 자리 채움용 예시다 — 실제 채널이 붙으면 갈아 끼운다.
 */
export function ProjectsCarousel() {
  return (
    <Surface tone="gray">
      <div className="py-16 md:py-24">
        <Carousel
          heading={
            <h2 className="text-2xl font-medium tracking-tight break-keep md:text-3xl">
              카드 한 장이 첫 장으로 이어집니다
            </h2>
          }
        >
          {Array.from({ length: 6 }, (_, i) => (
            <article
              key={i}
              className="w-[19rem] shrink-0 snap-start sm:w-[34rem] lg:w-[50rem]"
            >
              <AssetSlot tone="inset" className="aspect-[4/3] rounded-[2rem]" />
            </article>
          ))}
        </Carousel>

        <Carousel
          className="mt-20 md:mt-28"
          heading={
            <h2 className="text-2xl font-medium tracking-tight break-keep md:text-3xl">
              채널이 고르고, 피드가 건넵니다
            </h2>
          }
        >
          {CHANNELS.map((ch) => (
            <article
              key={ch.name}
              className="border-border/60 bg-card flex min-h-[13rem] w-[18rem] shrink-0 snap-start flex-col rounded-[1.75rem] border p-6 sm:w-[27rem]"
            >
              <div className="flex items-center gap-3">
                <AssetSlot className="bg-foreground/15 size-9 rounded-full" />
                <p className="text-xl font-medium">{ch.name}</p>
              </div>
              <p className="text-muted-foreground mt-2 text-sm break-keep">
                {ch.desc}
              </p>
              <p className="text-muted-foreground mt-auto pt-6 text-sm">게시물:</p>
              <p className="text-4xl font-medium tracking-tight">{ch.count}</p>
            </article>
          ))}
        </Carousel>
      </div>
    </Surface>
  );
}
