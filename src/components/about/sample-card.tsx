import Link from "next/link";
import { PostCard } from "@/components/feed/post-card";
import type { FeedPost } from "@/lib/feed";

/**
 * 히어로의 샘플 게시물. **실제 `PostCard`를 그대로 쓴다** — 닮게 그리면
 * 언젠가 한쪽만 고쳐진다 (PRD §11-56). 어드민 미리보기가 사용자 화면과
 * 같은 컴포넌트를 쓰는 것과 같은 이유다 (§5.10).
 *
 * 조회 집계는 안전하다: `record_view`는 `card-feed.tsx`와
 * `feed-scroller.tsx`에서만 불리고 `PostCard` 자신은 부르지 않는다.
 * 그래서 피드 밖에서 렌더해도 조회수가 늘지 않는다.
 *
 * 다만 좋아요·공유는 실동작이라 막아야 한다 — 소개 페이지가 조용히
 * `share_count`를 늘리면 안 된다. 그래서 `inert`로 서브트리 전체를
 * 비활성화한다.
 *
 * `inert`가 접근성 트리에서도 서브트리를 빼므로, 대체 텍스트와 이동은
 * **형제로 얹은** 오버레이 링크가 진다. 조상으로 감싸지 않는 이유:
 * `PostCard` 안에 이미 `<a>`(채널 링크)가 있어 중첩 앵커가 되면 유효하지
 * 않은 마크업이 된다.
 *
 * 래퍼의 `overflow-hidden`은 안전하다 — 카드 높이에 상한을 두지 않으므로
 * (§11-54가 경고한 상황) 잘릴 것이 없고, `border-b`의 각진 모서리만 다듬는다.
 */
export function SampleCard({ post }: { post: FeedPost }) {
  return (
    <div className="border-border bg-card relative overflow-hidden rounded-lg border">
      <div inert>
        <PostCard post={post} isGuest />
      </div>
      <Link
        href={`/p/${post.id}`}
        aria-label={`게시물 예시 「${post.books.title}」. 실제 게시물을 엽니다.`}
        className="focus-visible:ring-ring absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      />
    </div>
  );
}
