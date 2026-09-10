import { ArrowRight } from "lucide-react";
import {
  Container,
  SectionTitle,
  Stat,
  Surface,
} from "@/components/about/primitives";
import { QUOTES } from "@/components/about/quotes";
import { QuoteCard } from "@/components/about/quote-card";

const ROWS: [string, string][] = [
  ["서점 검색 대신", "그 자리에서 첫 장"],
  ["앱 설치 대신", "브라우저에서 바로"],
  ["결제·구독 대신", "전문 무료 열람"],
  ["회원가입 대신", "게스트로 시작"],
  ["미리보기 제한 대신", "끝까지 읽기"],
  ["다시 찾는 대신", "이어읽기"],
];

/** 참고 사이트 "We solve the bottlenecks" — 회색 둥근 면, 제목+후기 / 검정 6행, 통계 3개. */
export function Friction() {
  return (
    <Surface tone="gray">
      <Container className="py-16 md:py-24">
        {/* 행 높이는 오른쪽 검정 목록이 정하고, 왼쪽 인용 카드는 mt-auto로 그 바닥에 맞춘다 —
            참고 사이트처럼 두 상자의 아랫선이 한 줄이다. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-12">
          <div className="flex flex-col">
            <SectionTitle>
              책 읽기를 막는
              <br />
              마찰을 없앱니다
            </SectionTitle>
            <QuoteCard quote={QUOTES[1]} className="mt-12 lg:mt-auto" />
          </div>

          <ul className="bg-foreground text-background divide-background/10 divide-y rounded-[2rem] px-2 py-1">
            {ROWS.map(([lead, strong]) => (
              <li
                key={strong}
                // 참고 사이트 `.feature-list_item:hover { padding-left: 12px }` — 행이 0.25s로 오른쪽으로 밀린다.
                className="flex items-center gap-4 py-5 pr-5 pl-5 text-lg break-keep transition-[padding-left] duration-[250ms] hover:pl-8 md:text-xl"
              >
                <span className="bg-background text-foreground grid size-6 shrink-0 place-items-center rounded-full">
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
                <span className="text-background/70">
                  {lead}{" "}
                  <b className="text-background font-medium">{strong}</b>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-20 grid gap-10 sm:grid-cols-3 md:mt-28">
          <Stat
            value="3초"
            label={
              <>
                카드에서 첫 장까지,
                <br />
                화면 전환 한 번
              </>
            }
          />
          <Stat
            value="0원"
            label={
              <>
                전문 열람·보관함·이어읽기
                <br />
                전부 무료
              </>
            }
          />
          <Stat
            value="100%"
            label={
              <>
                등록 도서 전권에
                <br />
                권리 근거 기록
              </>
            }
          />
        </div>
      </Container>
    </Surface>
  );
}
