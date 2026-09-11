import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CARD_SCROLL_ITEM } from "@ttokttok/ui/feed/card-metrics";
import { PostCard } from "@/components/feed/post-card";
import { PostItem } from "@/components/feed/post-item";
import { getPost } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";
import { isRenderableCard } from "@ttokttok/shared/cards";
import type { FeedCardLayout } from "@ttokttok/shared/feed";

/**
 * 공유 딥링크 랜딩 (PRD §4, §5.5).
 *
 * 공유 버튼이 만드는 주소가 여기다. (main) 안에 두어 GNB가 붙는다 —
 * 밖에서 들어온 사람이 이 글만 보고 끝나지 않고 피드로 이어질 수 있어야 한다.
 *
 * 발행되지 않은 글은 RLS가 막아 404가 된다.
 *
 * **카드 게시물은 홈 카드(`PostCard`)를 그린다** (§11-68). 홈이 카드 피드가
 * 된 뒤 카드의 정식 모양은 홈 카드다 — 전면 뷰어용 `PostItem`은 홈이 전면
 * 피드였던 시절의 흔적이라, 공유 링크로 들어온 사람이 공유한 사람과 다른
 * 모양을 봤다. 영상은 전면 피드가 정식 모양이므로 `PostItem` 그대로다.
 * 뒤로가기는 그 게시물의 채널 홈으로 고정한다 — 채널 그리드에서 들어온
 * 주 흐름에 맞고, 공유 링크로 들어온 사람에게도 이어 볼 곳이 된다.
 */

/** 훅 영역의 문구를 공유 설명으로 쓴다 — 없으면 도서 소개. */
function shareDescription(
  layout: FeedCardLayout | null,
  intro: string | null,
): string | undefined {
  const text = [layout?.regions?.hook?.text, layout?.regions?.desc?.text]
    .filter((v) => typeof v === "string" && v.length > 0)
    .join(" — ");
  return text || intro || undefined;
}

export async function generateMetadata({
  params,
}: PageProps<"/p/[postId]">): Promise<Metadata> {
  const { postId } = await params;
  const post = await getPost(postId);
  if (!post) return { title: "게시물을 찾을 수 없어요" };

  const title = `${post.books.title} · ${post.books.author}`;
  const description = shareDescription(post.post_cards, post.books.intro);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      ...(post.books.cover_url
        ? { images: [{ url: post.books.cover_url, width: 800, height: 1200 }] }
        : {}),
    },
    twitter: {
      card: post.books.cover_url ? "summary_large_image" : "summary",
      title,
      ...(description ? { description } : {}),
    },
  };
}

export default async function PostPage({
  params,
  searchParams,
}: PageProps<"/p/[postId]">) {
  const { postId } = await params;
  const { comment } = await searchParams;
  const post = await getPost(postId);

  if (!post) notFound();

  // 렌더할 수 없는 카드 게시물은 빈 화면이 된다 — 그럴 바엔 404.
  if (post.type === "cards" && !isRenderableCard(post.post_cards)) notFound();

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds([post.id]),
  ]);

  const props = {
    post,
    liked: likedIds.has(post.id),
    isGuest: user === null,
    userId: user?.id ?? null,
    pinnedCommentId: typeof comment === "string" ? comment : undefined,
  };

  if (post.type === "video") {
    return (
      <div className="h-full">
        <PostItem {...props} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 홈 TopBar와 같은 56px 구조적 헤더. background 표면 위라 시맨틱 토큰. */}
      <header className="border-border bg-background flex h-14 shrink-0 items-center border-b px-2">
        <Link
          href={`/channel/${post.channels.slug}`}
          aria-label="채널로 돌아가기"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden />
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* 홈과 같은 하한(min(85%, 720px)) — 홈에서 본 카드와 같은 크기로 보인다. */}
        <div className={CARD_SCROLL_ITEM}>
          <PostCard {...props} />
        </div>
      </div>
    </div>
  );
}
