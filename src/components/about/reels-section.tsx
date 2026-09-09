import { DeviceFrame } from "@/components/about/device-frame";
import type { FeedPost } from "@/lib/feed";

/**
 * 제목이 위를 가로지르고, 그 아래에서 좁은 캡처 컬럼과 본문이 아래를 맞춘다
 * (`items-end`). 뷰어 섹션이 제목을 컬럼 안에 두고 좌우를 균등하게 나누는
 * 것과 구성이 다르다 — 같은 형태를 두 번 쓰지 않는다.
 *
 * **영상을 재생하지 않는다.** 랜딩에 YouTube 임베드나 자동재생 플레이어를
 * 얹으면 LCP·INP를 그만큼 잃고, 소개 페이지가 얻는 것보다 비싸다 (설계
 * 결정 6). 실제 릴스 화면 캡처가 그 역할을 한다.
 *
 * **도서 커버 그리드를 두지 않는다.** 처음에는 영상 게시물의 커버를 4열로
 * 깔았는데, 지금 DB의 영상 게시물이 참조하는 책이 위 추천 스트립과 **똑같은
 * 세 권**이었다 (하늘과 바람과 별과 시·날개·메밀꽃 필 무렵). 한 페이지에
 * 같은 커버가 두 번 나오면 자료가 아니라 자리채우기로 읽힌다. 중복을 걸러
 * 내면 남는 것이 0권이라 그 방법도 못 쓴다. 책이 넉넉히 쌓이면 다시 볼 일
 * 이다.
 *
 * `posts`를 여전히 받는 이유는 **게이트**다 — 영상 게시물이 하나도 없으면
 * 이 섹션 자체가 거짓이 되므로 그릴 수 없다.
 */
export function ReelsSection({
  src,
  width,
  height,
  posts,
}: {
  src: string | null;
  width: number;
  height: number;
  posts: FeedPost[];
}) {
  if (!src || posts.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <h2 className="text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
        영상으로 만나는 책
      </h2>

      {/* 캡처가 세로로 길고 본문은 세 줄이라, 아래를 맞추면(`items-end`) 본문
          위쪽에 500px짜리 빈 구역이 생긴다. 위를 맞춰 캡처와 본문이 같은 선에서
          시작하게 한다 — 뷰어 섹션의 `items-center`와도 갈린다. */}
      <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-[minmax(0,260px)_1fr] md:items-start md:gap-16">
        <DeviceFrame
          src={src}
          alt="똑똑 릴스 화면"
          width={width}
          height={height}
        />

        <p className="text-muted-foreground max-w-[32rem] text-base leading-relaxed break-keep">
          글보다 영상이 편한 날에는 릴스 탭에서 짧은 소개를 넘겨 보세요. 세로로
          넘기는 흐름은 익숙한 그대로이고, 마음에 남은 책은 화면 안에서 바로
          뷰어나 서점 링크로 이어집니다.
        </p>
      </div>
    </section>
  );
}
