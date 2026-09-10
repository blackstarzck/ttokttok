import { AssetSlot } from "@/components/about/asset-slot";
import {
  Chip,
  Container,
  SectionTitle,
  Surface,
} from "@/components/about/primitives";
import { cn } from "@ttokttok/ui/utils";

/**
 * 수치는 PRD §11-65가 재실측한 위키문헌 목록의 크기다 (2026-09-09):
 * 장르 9종으로 365 → 제외 규칙 329 → 저자 문서 재판정 293 → 금지 명단 290.
 */
const STEPS = [
  {
    title: "장르 분류로 모은다",
    value: "365편",
    body: "소설·시 계열 장르 9종의 분류 문서를 읽어 후보를 모은다",
    more: "+60",
  },
  {
    title: "제외 규칙을 적용한다",
    value: "329편",
    body: "하위 문서·친일문학·저작권 태그가 없는 문서를 뺀다",
    more: "+19",
  },
  {
    title: "저자 문서를 읽는다",
    value: "293편",
    body: "사망 연도·국적을 기계로 확인해 1962년 기준을 적용한다",
    more: null,
  },
  {
    title: "명단과 편집을 거친다",
    value: "290편",
    body: "금지 저작자 명단을 지나고, 소개·권리 근거를 편집자가 쓴다",
    more: null,
  },
];

/** 참고 사이트 "Only the top 0.82% get approved" — 검정에서 흰색으로 밝아지는 4단계 카드. */
export function RightsFunnel() {
  return (
    <Surface tone="gray">
      <Container className="py-16 md:py-24">
        <SectionTitle className="text-center">
          후보 365편 중 290편만 남습니다
        </SectionTitle>
        <p className="text-muted-foreground mt-4 text-center text-lg break-keep">
          위키문헌 후보를 네 단계로 걸러 등록합니다
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => {
            const dark = i === 0;
            return (
              <article
                key={step.title}
                className={cn(
                  "relative flex min-h-[35rem] flex-col overflow-hidden rounded-[2rem] p-6",
                  dark
                    ? "bg-foreground text-background"
                    : "border-border/60 bg-card border",
                )}
              >
                {/* 단계별로 낮아지는 바닥 채움 — 참고 사이트의 회색 수위 */}
                {i === 1 ? (
                  <div aria-hidden className="bg-foreground/60 absolute inset-x-0 bottom-0 h-[43%]" />
                ) : null}
                {i === 2 ? (
                  <div aria-hidden className="bg-foreground/40 absolute inset-x-0 bottom-0 h-[13%]" />
                ) : null}

                <div className="relative">
                  <Chip tone={dark ? "dark" : "light"}>{i + 1}단계</Chip>
                  <p className="mt-5 text-xl font-medium break-keep">{step.title}</p>
                </div>

                <div
                  className={cn(
                    "relative",
                    i === 0 && "mt-14",
                    i === 1 && "mt-24",
                    i === 2 && "mt-64",
                    i === 3 && "mt-auto",
                  )}
                >
                  {i === 3 ? (
                    <AssetSlot className="mx-auto mb-10 size-28 rounded-full" />
                  ) : null}
                  <p className="text-4xl font-medium tracking-tight">{step.value}</p>
                  <p
                    className={cn(
                      "mt-3 text-sm leading-snug break-keep",
                      dark ? "text-background/70" : "text-muted-foreground",
                    )}
                  >
                    {step.body}
                  </p>
                </div>

                {i < 3 ? (
                  <div className="relative mt-auto flex items-center pt-10">
                    <div className="flex -space-x-2">
                      {Array.from({ length: i === 2 ? 2 : 7 }, (_, k) => (
                        <AssetSlot
                          key={k}
                          className={cn(
                            "size-9 rounded-full ring-2",
                            dark
                              ? "bg-background/40 ring-foreground"
                              : "bg-card ring-foreground/50",
                          )}
                        />
                      ))}
                    </div>
                    {step.more ? (
                      <span
                        className={cn(
                          "ml-1 grid size-9 place-items-center rounded-full text-xs",
                          dark
                            ? "bg-background/20 text-background"
                            : "bg-card text-foreground",
                        )}
                      >
                        {step.more}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div aria-hidden className="bg-muted mt-auto -mx-6 -mb-6 h-3" />
                )}
              </article>
            );
          })}
        </div>
      </Container>
    </Surface>
  );
}
