import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TemplateCard } from "@/components/cards/template-card";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { CardActions } from "@/components/feed/card-actions";
import { formatByline } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";

/**
 * 홈 피드의 카드 한 장 (IA 개편 결정 3).
 *
 * 위에서 아래로 채널 헤더 → 본문 → 액션 줄 → 도서 바. 전면 피드가
 * 오버레이인 것과 달리 여기는 **쌓기**다 — 크롬이 컨텐츠를 가리지 않으므로
 * 스크림도 세이프존도 필요 없다.
 *
 * 본문 상자는 **고정 비율이 아니라 내용에 맞춰 늘어난다**. 근거와 실측은
 * template-card.tsx의 카드 모드 주석 — 4:5로 고정했던 첫 시도는 폭
 * 320~480px 전 구간과 도서명 1~3줄 전 조합을 만족하는 상자 높이가
 * 존재하지 않았다(좁은 폭은 넘치고 넓은 폭은 텅 빈다). 넘칠 때 flex가
 * 표지를 눌러 흡수하는데, 그 압축이 overflow 수치에 잡히지 않아 표지가
 * 찌그러진 채 조용히 나가는 것이 4:5를 버린 이유다.
 */
export function PostCard({
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
  /** 어드민 미리보기 전용 (PRD §5.10) — TemplateCard로 그대로 흘려보낸다.
   * 훅이 비어 있어도 스킵하지 않고 자리표시를 그리게 한다. */
  preview?: boolean;
}) {
  const byline = formatByline(post.books);

  return (
    // 풀블리드 — 좌우 여백을 두지 않는다. 인스타가 그렇고, 폭이 좁아질수록
    // 글이 더 여러 줄로 늘어나 본문이 더 길어지는데(narrow=더 높다), 넓어
    // 지면 반대로 짧아진다 — 폭을 좌우 패딩 없이 최대로 주는 쪽이 그 변동
    // 폭을 줄인다. 구분은 여백이 아니라 아래 경계선이 맡고, 모서리도
    // 둥글리지 않는다(화면 끝에 닿는 둥근 모서리는 어색하다).
    <article className="border-border bg-card overflow-hidden border-b">
      <Link
        href={`/channel/${post.channels.slug}`}
        className="focus-visible:ring-ring flex min-h-11 items-center gap-2 px-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar className="size-7">
          {post.channels.avatar_url ? (
            <AvatarImage src={post.channels.avatar_url} alt="" />
          ) : null}
          <AvatarFallback className="text-xs">
            {post.channels.name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">
          {post.channels.name}
        </span>
      </Link>

      {/* 고정 aspect-4/5가 아니라 auto — 내용에 맞춰 늘어난다(사전 병합
          리뷰 Important 2·3). overflow-hidden도 없다: 상자에 높이 상한이
          없으니 잘릴 것이 없고, 있었다면 그건 표지가 눌려 찌그러지는 걸
          다시 숨기는 것일 뿐이다. */}
      <div data-card-body className="bg-background">
        <TemplateCard
          layout={post.post_cards}
          book={post.books}
          variant="card"
          preview={preview}
        />
      </div>

      <div className="py-1">
        <CardActions
          post={post}
          liked={liked}
          isGuest={isGuest}
          userId={userId}
        />
      </div>

      <BookSheet book={post.books} isGuest={isGuest}>
        <button
          type="button"
          aria-label={`${post.books.title} 도서 정보`}
          className="focus-visible:ring-ring flex w-full items-center gap-3 px-3 pb-3 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <BookCover book={post.books} className="w-9 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium break-keep">
              {post.books.title}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {byline}
            </span>
          </span>
        </button>
      </BookSheet>
    </article>
  );
}
