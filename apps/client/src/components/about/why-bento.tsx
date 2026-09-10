import { Briefcase, Check, Play, Users } from "lucide-react";
import { AssetSlot } from "@/components/about/asset-slot";
import { Marquee } from "@/components/about/marquee";
import {
  Chip,
  Container,
  IconCircle,
  SectionTitle,
  Surface,
} from "@/components/about/primitives";
import { SearchCta } from "@/components/about/search-cta";

/** 칩 줄 넷 — 참고 사이트처럼 홀수 줄은 왼쪽으로, 짝수 줄은 오른쪽으로 흐른다. */
const CHIP_ROWS: { label: string; active?: boolean }[][] = [
  [
    { label: "소설", active: true },
    { label: "시" },
    { label: "수필" },
    { label: "희곡" },
    { label: "동화" },
    { label: "평론" },
  ],
  [
    { label: "단편" },
    { label: "장편", active: true },
    { label: "서간" },
    { label: "기행" },
    { label: "평론" },
    { label: "동시" },
  ],
  [
    { label: "사실주의" },
    { label: "모더니즘", active: true },
    { label: "낭만" },
    { label: "민요" },
    { label: "계몽" },
    { label: "향토" },
  ],
  [
    { label: "경성" },
    { label: "농촌", active: true },
    { label: "장터" },
    { label: "바다" },
    { label: "유학" },
    { label: "고향" },
  ],
];

const LOGO_WIDTHS = ["w-20", "w-24", "w-16", "w-24", "w-20"];

/** 참고 사이트 "Why teams choose Awesomic" 벤토 3열. 아래에 검색 CTA 카드가 이어진다. */
export function WhyBento() {
  return (
    <Surface tone="white">
      <Container className="pt-16 pb-16 md:pt-24 md:pb-20">
        <SectionTitle className="text-center">왜 똑똑인가</SectionTitle>

        {/* 세 열은 그리드가 같은 높이로 늘리고, 열마다 카드 하나(flex-1)가 남는
            높이를 먹는다 — 열 바닥이 한 줄이고 그리드 안에 빈 여백이 없다. */}
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {/* 1열. min-w-0: 마퀴 트랙(w-max)의 최소 폭이 그리드 셀을 밀어 페이지가
              가로로 넘치는 것을 막는다(375px 실측 scrollWidth 1228). */}
          <div className="flex min-w-0 flex-col gap-4">
            <article className="bg-muted min-w-0 rounded-[2rem] p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-4xl font-medium tracking-tight">1962</p>
                  <p className="mt-2 text-lg break-keep">년 이전 사망 저작자</p>
                </div>
                <IconCircle>
                  <Users aria-hidden />
                </IconCircle>
              </div>
              <Marquee fade className="mt-8" itemsClassName="gap-8 pr-8">
                {LOGO_WIDTHS.map((w, i) => (
                  <AssetSlot key={i} tone="inset" className={`h-6 rounded ${w}`} />
                ))}
              </Marquee>
            </article>

            <article className="bg-muted relative min-h-[31rem] flex-1 overflow-hidden rounded-[2rem] p-7 text-center">
              <p className="text-xl leading-snug break-keep">
                권리 확인을 거친
                <br />
                작품만
              </p>
              <AssetSlot
                tone="inset"
                className="absolute inset-x-0 bottom-0 h-2/3"
              />
            </article>

            <article className="bg-foreground text-background relative grid min-h-[10.5rem] place-items-center overflow-hidden rounded-[2rem] p-7 text-center">
              <AssetSlot tone="dark" className="absolute inset-0" />
              <p className="relative text-xl leading-snug break-keep">
                카드에서 첫 장까지
                <br />
                탭 한 번
              </p>
            </article>
          </div>

          {/* 2열 */}
          <article className="bg-muted flex flex-col overflow-hidden rounded-[2rem]">
            <div className="flex items-center gap-4 p-6">
              <AssetSlot tone="inset" className="size-16 rounded-full" />
              <div>
                <p className="text-xl font-medium">윤동주</p>
                <p className="text-muted-foreground text-sm">
                  「서시」 ·{" "}
                  <span className="text-foreground">
                    하늘과 바람과 별과 시
                  </span>{" "}
                  (1948)
                </p>
              </div>
            </div>
            <div className="relative min-h-[28rem] flex-1">
              <AssetSlot tone="inset" className="absolute inset-0" />
              <div className="absolute inset-x-6 bottom-6 flex items-center gap-4">
                <span
                  aria-hidden
                  className="bg-card/70 grid size-20 place-items-center rounded-full backdrop-blur"
                >
                  <Play className="size-7 fill-current" />
                </span>
                <span className="bg-foreground text-background px-4 py-2 text-sm font-bold tracking-wide">
                  지금 읽기
                </span>
              </div>
            </div>
          </article>

          {/* 3열 */}
          <div className="flex min-w-0 flex-col gap-4">
            <article className="bg-muted flex items-start justify-between gap-4 rounded-[2rem] p-7">
              <div>
                <p className="text-4xl font-medium tracking-tight">0원</p>
                <p className="mt-2 text-lg">결제도 설치도</p>
              </div>
              <IconCircle>
                <Check aria-hidden />
              </IconCircle>
            </article>

            <article className="bg-muted min-w-0 overflow-hidden rounded-[2rem] py-7">
              {/* 참고 사이트처럼 칩 줄은 카드 가장자리까지 꽉 차서 흐르고, 카드의 둥근 모서리에서 잘린다. */}
              <div className="space-y-2">
                {CHIP_ROWS.map((row, i) => (
                  <Marquee
                    key={i}
                    reverse={i % 2 === 1}
                    itemsClassName="gap-2 pr-2"
                    className="[--marquee-duration:26s]"
                  >
                    {row.map((chip) => (
                      <Chip key={chip.label} active={chip.active}>
                        {chip.label}
                      </Chip>
                    ))}
                  </Marquee>
                ))}
              </div>
              <div className="mt-24 flex items-end justify-between gap-4 px-7">
                <div>
                  <p className="text-4xl font-medium tracking-tight">30+</p>
                  <p className="mt-2 text-lg">카테고리</p>
                </div>
                <IconCircle>
                  <Briefcase aria-hidden />
                </IconCircle>
              </div>
            </article>

            <article className="bg-muted flex flex-1 flex-col overflow-hidden rounded-[2rem] p-7 text-center">
              <p className="text-xl">구독료 없음</p>
              <Chip className="mx-auto mt-3">전권 무료</Chip>
              {/* 남는 높이를 자리가 먹고, 아래로 삐져나가 카드 모서리에서 잘린다. */}
              <AssetSlot
                tone="inset"
                className="mx-auto mt-8 -mb-14 min-h-48 w-40 flex-1 rounded-[3rem]"
              />
            </article>
          </div>
        </div>
      </Container>
      <SearchCta />
    </Surface>
  );
}
