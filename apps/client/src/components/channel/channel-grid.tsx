import { isRenderableCard } from "@ttokttok/shared/cards";
import type { FeedPost } from "@ttokttok/shared/feed";
import { PostTile } from "@/components/channel/post-tile";

/**
 * 채널 게시물 모자이크 (설계 §1.3, 목적지는 PRD §5.9·§11-58 그대로).
 *
 * 렌더 불가 카드(훅이 빈 카드)는 건너뛴다 — 타일은 보이는데 누르면
 * `/p/[postId]`가 404였다. 필터로 전부 걸러진 경우도 "없어요"다.
 *
 * 실패와 빈 목록은 다른 문구다 (§11-61). 히어로는 이미 떠 있으므로
 * 화면을 통째로 지우지 않고 그리드 자리만 바꾼다.
 */
export function ChannelGrid({
  posts,
  slug,
  failed,
}: {
  posts: FeedPost[];
  slug: string;
  failed: boolean;
}) {
  const visible = posts.filter(
    (post) => post.type === "video" || isRenderableCard(post.post_cards),
  );

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-10 text-center text-sm break-keep">
        {failed
          ? "게시물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          : "아직 발행한 게시물이 없어요."}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-1 pb-4">
      {visible.map((post) => (
        <li key={post.id}>
          <PostTile
            post={post}
            // 영상은 이 채널 안에서 이어 보게 릴스 뷰어로(결정 7), 카드는 상세로.
            href={
              post.type === "video"
                ? `/channel/${slug}/reels?start=${post.id}`
                : `/p/${post.id}`
            }
          />
        </li>
      ))}
    </ul>
  );
}
