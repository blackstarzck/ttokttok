import { Chip, Container, Surface } from "@/components/about/primitives";
import { AboutFooter } from "@/components/about/about-footer";

const POSTS = [
  "1930년대 단편을 오늘 읽는 법",
  "이어읽기가 기억하는 것, 잊는 것",
  "위키문헌에서 책이 오는 길",
  "카드 한 장에 책 한 권을 담는 규칙",
  "시집을 피드에서 읽는다는 것",
  "경성을 걷는 소설 다섯 편",
  "왜 미리보기가 없나요",
  "뷰어를 다크로 시작하는 이유",
];

/**
 * 참고 사이트 하단의 블로그 목록(오른쪽 스크롤 열) + 푸터. 같은 회색 면에 담아
 * 페이지 끝까지 한 색으로 내려간다. 제목은 자리 채움용 예시다.
 */
export function ReadingList() {
  return (
    <Surface tone="gray">
      <Container className="pt-16 md:pt-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-medium tracking-tight md:text-3xl">읽을거리</h2>
            <p className="text-muted-foreground mt-3 break-keep">
              채널이 쓴 짧은 글과 새 소식
            </p>
          </div>
          <div className="relative">
            <div className="max-h-[36rem] overflow-y-auto pr-4 [scrollbar-width:thin]">
              {POSTS.map((title) => (
                <article
                  key={title}
                  className="bg-card mb-4 rounded-[1.75rem] p-6"
                >
                  <Chip>소식</Chip>
                  <p className="mt-4 text-xl font-medium break-keep md:text-2xl">
                    {title}
                  </p>
                </article>
              ))}
            </div>
            <div
              aria-hidden
              className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t to-transparent"
            />
          </div>
        </div>
      </Container>
      <AboutFooter />
    </Surface>
  );
}
