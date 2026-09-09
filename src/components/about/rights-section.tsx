/**
 * 첫 방문자가 실제로 하는 질문("무료로 전문을 준다니, 합법인가")에 답한다.
 * §5.11의 권리 판정은 공들인 작업인데 사용자 화면 어디에도 드러나 있지
 * 않았다.
 *
 * 카피는 PRD §5.11의 만료 판별 규칙을 그대로 옮겼다. 법적 주장이므로
 * 문구를 임의로 바꾸면 안 된다.
 */
export function RightsSection() {
  return (
    <section className="border-border bg-muted/40 border-t">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <h2 className="max-w-[34rem] text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
          본문을 드리는 책은 저작권이 만료된 작품입니다
        </h2>

        <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-16">
          <p className="text-muted-foreground max-w-[34rem] text-base leading-relaxed break-keep">
            전문을 읽을 수 있는 책은 1962년 이전에 사망한 저작자의 작품입니다.
            2013년 개정 전 기준인 사후 50년으로 보호기간이 이미 끝난
            저작물이고, 개정된 70년 기준은 그 전에 만료된 작품에 소급되지
            않습니다. 본문은 위키문헌에서 수급해 저작자의 사망 연도를 확인한
            뒤 등록합니다.
          </p>
          <p className="text-muted-foreground max-w-[34rem] text-base leading-relaxed break-keep">
            해외 고전은 원작이 만료되었어도 한국어 번역본에 번역자의 저작권이
            따로 남아 있어 본문을 제공하지 않습니다. 저작권이 살아 있는 책은
            소개 카드와 서점 구매 링크까지만 보여드립니다.
          </p>
        </div>
      </div>
    </section>
  );
}
