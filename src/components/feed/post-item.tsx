import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TemplateCard } from "@/components/cards/template-card";
import { ActionBar } from "@/components/feed/action-bar";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { VideoPlayer } from "@/components/feed/video-player";
import type { FeedPost } from "@/lib/feed";

/**
 * 피드의 게시물 한 개. 뷰포트 높이를 꽉 채우고 스냅된다.
 *
 * 레이아웃은 분할이 아니라 오버레이다 (설계:
 * docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md).
 * 홈의 구조적 형제는 하단 액션 바와 컨텐츠 영역 둘뿐이고, 액션 레일과
 * 도서 정보 바는 컨텐츠 위에 얹히는 레이어다.
 *
 * z 계층: 본문 0 → 스크림 2 → 크롬 3 → BottomNav 50.
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
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  preview?: boolean;
}) {
  const byline = [
    post.books.author,
    post.books.translator ? `${post.books.translator} 옮김` : null,
    post.books.publisher,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      data-post-id={post.id}
      className="relative h-full snap-start snap-always overflow-hidden"
    >
      {/* z-0 — 본문. 풀블리드로 컨텐츠 영역을 꽉 채운다. */}
      <div className="absolute inset-0">
        {post.type === "video" ? (
          post.post_videos ? (
            <VideoPlayer video={post.post_videos} poster={post.books.cover_url} />
          ) : (
            // 영상 레코드가 없는 영상 게시물 — 빈 화면 대신 도서를 보여준다.
            <div className="flex h-full items-center justify-center px-6">
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

      {/*
        z-2 — 스크림. 검정 고정이라 테마를 면제받는다.
        Tailwind 그라디언트 클래스 대신 인라인 스타일을 쓰는 이유: 이 값은
        설계 문서가 정한 정확한 값이고, 클래스로 옮기면 v3/v4 이름 차이
        (bg-gradient-to-t vs bg-linear-to-t)에 휘둘린다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-40"
        style={{ background: "linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)" }}
      />

      {/* z-3 — 우측 세로 액션 레일 */}
      <div className="absolute right-2 bottom-[88px] z-[3]">
        <ActionBar post={post} liked={liked} isGuest={isGuest} userId={userId} />
      </div>

      {/* z-3 — 하단 도서 정보 바.
          아바타는 채널로, 도서 정보는 상세 시트로 — 목적지가 다르므로
          하나의 링크로 묶지 않는다 (PRD §5.1). 채널 아바타는 오른쪽에
          따로 두고 44px 터치 타깃을 지킨다. 경계선은 쓰지 않는다 —
          층은 스크림이 만든다. */}
      <footer className="absolute inset-x-0 bottom-0 z-[3] flex h-[76px] items-center gap-3 px-3">
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보`}
            className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <BookCover book={post.books} overlay className="w-10 shrink-0" />

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
          className="focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Avatar className="size-8 border border-white/50 bg-black/[0.28]">
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
