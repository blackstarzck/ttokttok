import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostItem } from "@/components/feed/post-item";
import { getPost } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";
import { CARD_REGISTRY } from "@/components/cards/registry";

/**
 * 공유 딥링크 랜딩 (PRD §4, §5.5).
 *
 * 공유 버튼이 만드는 주소가 여기다. (main) 안에 두어 GNB가 붙는다 —
 * 밖에서 들어온 사람이 이 글만 보고 끝나지 않고 피드로 이어질 수 있어야 한다.
 *
 * 발행되지 않은 글은 RLS가 막아 404가 된다.
 */

/** 훅 카드(a)의 헤드라인을 공유 설명으로 쓴다 — 없으면 도서 소개. */
function shareDescription(
  cards: { template_category: string; body: Record<string, unknown> }[],
  intro: string | null,
): string | undefined {
  const hook = cards.find((c) => c.template_category === "a");
  const headline = hook?.body["title-01"];
  const sub = hook?.body["description-01"];
  const text = [headline, sub].filter((v) => typeof v === "string").join(" — ");
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

export default async function PostPage({ params }: PageProps<"/p/[postId]">) {
  const { postId } = await params;
  const post = await getPost(postId);

  if (!post) notFound();

  // 렌더 가능한 카드가 하나도 없으면 빈 화면이 된다 — 그럴 바엔 404.
  const renderable = post.post_cards.some(
    (c) => c.template_category in CARD_REGISTRY,
  );
  if (!renderable && post.type === "cards") notFound();

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds([post.id]),
  ]);

  return (
    <div className="h-full">
      <PostItem
        post={post}
        liked={likedIds.has(post.id)}
        isGuest={user === null}
        userId={user?.id ?? null}
      />
    </div>
  );
}
