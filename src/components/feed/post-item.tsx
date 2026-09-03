import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TemplateCard } from "@/components/cards/template-card";
import { ActionBar } from "@/components/feed/action-bar";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { VideoPlayer } from "@/components/feed/video-player";
import { CHROME_SAFE_AREA } from "@/components/feed/chrome";
import { formatByline } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FeedPost } from "@/lib/feed";

/**
 * 피드의 게시물 한 개. 뷰포트 높이를 꽉 채우고 스냅된다.
 *
 * 레이아웃은 분할이 아니라 오버레이다 (설계:
 * docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md).
 * 홈의 구조적 형제는 하단 액션 바와 컨텐츠 영역 둘뿐이고, 액션 레일과
 * 도서 정보 바는 컨텐츠 위에 얹히는 레이어다.
 *
 * z 계층: 본문 z-auto(기본 층) → 스크림 2 → 크롬 3 → BottomNav 50.
 * 본문에 z-0을 주지 말 것 — position:absolute + z-index:auto는 스태킹
 * 컨텍스트를 만들지 않지만 z-0은 만든다. z-0을 붙이면 VideoPlayer의
 * 음소거 버튼(z-[3])이 그 컨텍스트에 갇혀 스크림·크롬 아래로 밀린다.
 *
 * 크롬은 게시물 유형·테마와 무관하게 흰색 한 벌이다. 밑에 깔린 것이
 * 우리 표면이든 남의 픽셀이든 같은 처방을 쓴다 — 인스타·유튜브·틱톡
 * 실측에서 확인한 규칙이다 (설계 문서 "선례 조사").
 *
 * preview는 어드민 미리보기 전용이다 (PRD §5.10). 미리보기가 이 컴포넌트를
 * 그대로 쓰는 덕분에 "관리자가 본 화면"과 "사용자가 볼 화면"이 어긋날 수
 * 없다 — 마크업도 클래스도 한 벌뿐이다. 어드민은 라이트 고정이라
 * 가장 불리한 조건이 항상 노출된다.
 */
export function PostItem({
  post,
  liked = false,
  isGuest = true,
  userId = null,
  preview,
  pinnedCommentId,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  preview?: boolean;
  /** 알림에서 들어온 대상 댓글. 액션 바를 거쳐 댓글 시트로 흘려보낸다. */
  pinnedCommentId?: string;
}) {
  const byline = formatByline(post.books);

  return (
    // data-post-id·data-index와 스냅 정렬(snap-start/snap-always)은 여기가 아니라
    // FeedScroller의 슬롯 래퍼에 있다 — 조회 대상이 슬롯이기 때문이다
    // (IntersectionObserver가 [data-index]를 관찰하고 그 dataset.postId를 읽는다).
    // 슬롯은 창 밖에서 내용이 비워져도 자리를 지켜야 하므로 스냅도 슬롯의 몫이다.
    // 여기에 사본을 두면 [data-post-id] 조회가 게시물당 두 번 걸린다.
    //
    // h-full은 남긴다 — 아래 absolute 자식들이 이 박스를 기준으로 풀린다.
    <article className="relative h-full overflow-hidden">
      {/* z-0 — 본문. 풀블리드로 컨텐츠 영역을 꽉 채운다. */}
      <div className="absolute inset-0">
        {post.type === "video" ? (
          post.post_videos ? (
            <VideoPlayer video={post.post_videos} poster={post.books.cover_url} />
          ) : (
            // 영상 레코드가 없는 영상 게시물 — 빈 화면 대신 도서를 보여준다.
            // 크롬이 컨텐츠 위에 얹히므로 이 조기 반환 분기도 세이프존을 진다.
            <div className={cn("flex h-full items-center justify-center", CHROME_SAFE_AREA)}>
              <BookCover book={post.books} className="w-32" />
            </div>
          )
        ) : (
          <TemplateCard
            layout={post.post_cards}
            book={post.books}
            preview={preview}
          />
        )}
      </div>

      {/* z-2 — 상단 스크림. 상단 바(z-3)가 흰색 고정이라 밝은 커버 위에서
          읽히려면 대비가 필요하다. 하단과 같은 이징이라 띠가 안 보인다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-24"
        style={{
          background:
            "linear-gradient(to bottom, rgb(0 0 0 / 0.38) 0%, rgb(0 0 0 / 0.22) 35%, rgb(0 0 0 / 0.12) 60%, rgb(0 0 0 / 0.05) 80%, transparent 100%)",
        }}
      />

      {/*
        z-2 — 스크림. 검정 고정이라 테마를 면제받는다.
        Tailwind 그라디언트 클래스 대신 인라인 스타일을 쓰는 이유: 이 값은
        설계 문서가 정한 정확한 값이고, 클래스로 옮기면 v3/v4 이름 차이
        (bg-gradient-to-t vs bg-linear-to-t)에 휘둘린다.

        커브는 전 구간 단조 감소(ease-out)다 — 구간별 기울기가 위로 갈수록
        줄어들어 어디에도 경계가 안 생기고 처음부터 끝까지 점차 투명해진다.
        하단을 평평하게 유지하는 커브(바 가독성 우선)는 띠로 보여서 기각했다
        (설계 문서 "스크림"). 바 구간의 흰 텍스트 가독성은 feed-chrome-text
        그림자가 담당한다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-30"
        style={{
          background:
            "linear-gradient(to top, rgb(0 0 0 / 0.45) 0%, rgb(0 0 0 / 0.26) 35%, rgb(0 0 0 / 0.15) 60%, rgb(0 0 0 / 0.06) 80%, transparent 100%)",
        }}
      />

      {/* z-3 — 우측 세로 액션 레일. bottom 100 = 바 하단 여백(12) + 도서 바(76) + 여유(12) */}
      <div className="absolute right-2 bottom-[100px] z-[3]">
        <ActionBar
          post={post}
          liked={liked}
          isGuest={isGuest}
          userId={userId}
          pinnedCommentId={pinnedCommentId}
        />
      </div>

      {/* z-3 — 하단 도서 정보 바. bottom 12 — 바닥에 붙이지 않고
          BottomNav와 숨통을 둔다.
          아바타는 채널로, 도서 정보는 상세 시트로 — 목적지가 다르므로
          하나의 링크로 묶지 않는다 (PRD §5.1). 채널 아바타는 오른쪽에
          따로 두고 44px 터치 타깃을 지킨다. 경계선은 쓰지 않는다 —
          층은 스크림이 만든다. */}
      <footer className="absolute inset-x-0 bottom-3 z-[3] flex h-[76px] items-center gap-3 px-3">
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 focus-visible:outline-none"
          >
            <BookCover book={post.books} overlay className="w-11 shrink-0" />

            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="feed-chrome-text truncate text-xs text-white/90">
                {post.books.category}
              </span>
              <span className="feed-chrome-text truncate text-sm font-medium text-white break-keep">
                {post.books.title}
              </span>
              <span className="feed-chrome-text truncate text-xs text-white/90">
                {byline}
              </span>
            </span>
          </button>
        </BookSheet>

        <Link
          href={`/channel/${post.channels.slug}`}
          aria-label={`${post.channels.name} 채널`}
          className="flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 focus-visible:outline-none"
        >
          {/*
            Avatar 루트의 ::after 링(after:border-border)은 지울 수 없으므로
            border 유틸을 주는 대신 의사요소 자체를 덮어쓴다 — border를 얹으면
            링이 두 겹(테마 토큰 + 흰색)이 되고 box-sizing 때문에 32px가
            아니라 30px로 그려진다. mix-blend-normal로 다크의 lighten도 끈다.
          */}
          <Avatar className="size-8 bg-black/[0.28] after:border-white/50 after:mix-blend-normal dark:after:mix-blend-normal">
            {post.channels.avatar_url ? (
              <AvatarImage src={post.channels.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="feed-chrome-text bg-transparent text-xs text-white">
              {post.channels.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </Link>
      </footer>
    </article>
  );
}
