const STEPS = [
  {
    title: "피드에서 발견",
    body: "장르별 큐레이션 채널이 책 한 권을 카드 한 장으로 소개합니다.",
  },
  {
    title: "탭 한 번에 읽기",
    body: "전문을 가진 책은 그 자리에서 뷰어가 열립니다. 로그인도 필요 없습니다.",
  },
  {
    title: "진행률로 이어읽기",
    body: "어디까지 읽었는지 남습니다. 보관함과 완독 기록도 함께 쌓입니다.",
  },
] as const;

/**
 * 카드를 쓰지 않는다 — 표면을 세울 위계가 없고, 여기서는 헤어라인이 같은
 * 일을 더 조용히 한다.
 *
 * 컬럼 폭을 1.2fr / 1fr / 1fr로 흘려 균등 3분할을 피한다.
 */
export function AboutLoop() {
  return (
    <section className="border-border border-y" aria-label="이용 흐름">
      <div className="divide-border mx-auto max-w-6xl divide-y md:grid md:grid-cols-[1.2fr_1fr_1fr] md:divide-x md:divide-y-0">
        {STEPS.map((step) => (
          <div key={step.title} className="px-5 py-10 md:px-8 md:py-14">
            <h2 className="text-lg font-bold tracking-tight break-keep md:text-xl">
              {step.title}
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed break-keep">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
