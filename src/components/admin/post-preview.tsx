"use client";

import { useQuery } from "@tanstack/react-query";
import { PostItem } from "@/components/feed/post-item";
import { PostCard } from "@/components/feed/post-card";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/feed/top-bar";
import { CARD_SCROLL_ITEM } from "@/components/feed/card-metrics";
import { createClient } from "@/lib/supabase/client";
import type { FeedBook, FeedCardLayout, FeedPost } from "@/lib/feed";
import { BOOK_SELECT } from "@/lib/book-fields";

/**
 * 카드 미리보기 프레임 폭.
 *
 * 홈 카드는 풀블리드라 `(main)` 레이아웃의 `max-w-frame`(globals.css,
 * 480px)을 그대로 받는다 — 좌우 패딩이 없으니 프레임 폭 = 카드 폭이다.
 * 어드민은 보통 데스크톱 브라우저에서 쓰므로, 그 화면에서 홈을 열면
 * 뷰포트가 480px보다 넓어 카드가 이 상한(480px)을 그대로 받는다. 예전
 * 375px(전면 피드용 폰 실측 폭)를 그대로 물려 쓰면 어드민이 보는 폭과
 * 사용자 다수가 실제로 받는 폭이 달라, 375px에서는 안 넘치던 텍스트가
 * 480px에서 여백을 만들거나 그 반대로 보일 수 있다.
 */
const CARD_FRAME_WIDTH = 480;

/** 전면 피드(릴스·게시물 상세) 미리보기 폭 — 기존 375px 실측 폭을 유지한다. */
const FULLSCREEN_FRAME_WIDTH = 375;

/**
 * 미리보기가 쓸 도서 한 권.
 *
 * 폼의 도서 선택지에 미리 다 실으면 도서가 늘수록 목록이 무거워진다 —
 * 목차만 해도 도서당 수십 줄이다. 그래서 고른 순간에 한 권만 가져온다.
 *
 * 서버 액션이 아니라 브라우저 클라이언트로 읽는다. books는 공개 읽기
 * (RLS books_select_all)라 anon 키로 충분하고, 클라이언트 컴포넌트는
 * client.ts를 쓴다는 규칙(FRONTEND.md §5)에도 맞는다. 무엇보다 미리보기가
 * 어드민 세션의 토큰 갱신 경로를 건드릴 이유가 없다.
 */
async function fetchPreviewBook(bookId: string): Promise<FeedBook | null> {
  const { data, error } = await createClient()
    .from("books")
    .select(BOOK_SELECT)
    .eq("id", bookId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    // toc는 jsonb라 NULL이나 예상 밖의 형태로 올 수 있다. 카드가 map을 돌다
    // 죽는 것보다 목차가 비어 보이는 편이 낫다.
    toc: Array.isArray(data.toc) ? (data.toc as string[]) : [],
  };
}

export type PreviewChannel = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
};

/** 채널을 아직 안 골랐을 때. 아바타 자리만 비워 둔다. */
const NO_CHANNEL: PreviewChannel = {
  id: "",
  name: "",
  slug: "",
  avatar_url: null,
};

function Frame({
  width = CARD_FRAME_WIDTH,
  children,
}: {
  /** 프레임 내용 폭(px) — 실제로 그 게시물 유형이 받는 폭과 같아야 한다. */
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border w-fit overflow-hidden rounded-xl border shadow-sm">
      {/*
        높이 812px, 폭은 게시물 유형이 실제로 받는 폭을 그대로 써야 한다
        (카드 480px·전면 375px — 아래 CARD_FRAME_WIDTH/FULLSCREEN_FRAME_WIDTH).
        테두리를 이 박스에 걸면 box-sizing이 border-box라 내용 폭이 2px
        줄어 미리보기가 거짓말을 한다 — 그래서 테두리는 바깥 래퍼가 갖는다.

        inert는 하위 트리의 포인터·키보드·포커스를 브라우저 수준에서
        막는다. ActionBar·CardActions는 record_share RPC와 analytics를
        실제로 호출하므로 미리보기에서 눌리면 집계가 오염된다.
        pointer-events-none은 키보드로 뚫리지만 inert는 뚫리지 않는다.
      */}
      <div
        inert
        style={{ width }}
        className="bg-background flex h-[812px] flex-col"
      >
        {children}
      </div>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <Frame>
      <div className="text-muted-foreground flex h-full items-center justify-center px-8 text-center text-sm break-keep">
        {message}
      </div>
    </Frame>
  );
}

/**
 * 카드 조합 실시간 미리보기 (PRD §5.10).
 *
 * 사용자 화면을 흉내 내지 않고 **그 게시물이 실제로 나타나는 화면과 같은
 * 컴포넌트를 그대로 쓴다**: `type='cards'`는 홈에서 `PostCard`로,
 * `type='video'`는 릴스·게시물 상세에서 `PostItem`으로 보이므로 미리보기도
 * 같은 분기를 탄다. 사전 병합 리뷰(Important 4)에서 이 미리보기가 카드
 * 게시물도 항상 `PostItem`(전면 레이아웃)으로 그리는 게 드러났다 — 홈이
 * 카드 피드로 바뀐 뒤에도 남아 있던 오래된 가정이었다. 상자·패딩·커버
 * 크기가 실제 홈과 달라, 편집기에서 상한까지 채워 미리보기를 통과시킨
 * 문구가 홈에서는 넘칠 수 있었다(정확히 §5.10이 막으려던 실패).
 *
 * (main) 레이아웃과 같은 박스 구조로 감싸므로, 마크업이나 클래스가
 * 한쪽만 바뀌어 어긋날 여지가 없다. 이 설계에는 규약이 따라붙는다:
 * 카드 컴포넌트에 부수효과를 넣으면 미리보기가 그것을 실행한다
 * (FRONTEND.md §3).
 *
 * 오늘 이 컴포넌트를 실제로 호출하는 곳(post-editor.tsx)은 카드 게시물
 * 편집기뿐이다 — 영상 게시물 폼(video-post-form.tsx)에는 실시간 미리보기가
 * 아예 없다. `type` 분기는 그래도 남겨 둔다: FeedPost를 쓰는 다른 곳
 * (post-item.tsx 등)이 전부 이 분기로 화면을 정하므로, 이 컴포넌트만
 * "카드 전용"이라고 가정하면 나중에 영상 미리보기가 추가될 때 또 하나의
 * "닮았지만 다른" 갈림길이 생긴다.
 */
export function PostPreview({
  bookId,
  channel,
  layout,
}: {
  bookId: string;
  channel: PreviewChannel | null;
  layout: FeedCardLayout;
}) {
  const { data: book, isLoading } = useQuery({
    queryKey: ["admin", "preview-book", bookId],
    queryFn: () => fetchPreviewBook(bookId),
    enabled: Boolean(bookId),
    staleTime: 60_000,
  });

  if (!bookId) return <Empty message="도서를 고르면 미리보기가 나타납니다." />;
  if (isLoading) return <Empty message="도서를 불러오는 중…" />;
  if (!book) return <Empty message="도서를 불러오지 못했습니다." />;

  const post: FeedPost = {
    id: "preview",
    type: "cards",
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    view_count: 0,
    books: book,
    channels: channel ?? NO_CHANNEL,
    post_cards: layout,
    post_videos: null,
  };

  const isVideo = post.type === "video";

  return (
    <Frame width={isVideo ? FULLSCREEN_FRAME_WIDTH : CARD_FRAME_WIDTH}>
      {/*
        (main) 레이아웃과 같은 박스다: min-h-0 flex-1로 남은 높이를 주고
        하단 GNB가 그 아래를 차지한다. main 태그를 쓰지 않는 이유는 어드민
        레이아웃에 이미 main이 있어 두 개가 되기 때문이다.

        overflow-y-auto — CardFeed(실제 홈)도 카드를 이 클래스를 쓰는
        컨테이너 안에서 스크롤한다. 카드 상자는 이제 고정 비율이 아니라
        내용에 맞춰 늘어나므로(post-card.tsx) 이론상 넘칠 일이 없지만,
        바깥 Frame 래퍼에는 overflow-hidden이 있다 — 여기서 스크롤을 열어
        두지 않으면 어떤 이유로든 812px를 넘는 내용이 잘려 나가 편집자가
        문제를 보지 못한 채 발행하게 된다. 잘라서 숨기기보다는 스크롤로
        드러내는 쪽을 택한다.
      */}
      {/*
        카드 미리보기에만 TopBar를 넣는다 — 실제 홈에는 있고 릴스(전면
        피드)에는 없기 때문이다. 56px 스페이서를 쓰지 않는 이유: TopBar는
        `h-14 shrink-0` 한 줄이라 높이를 베끼면 그게 두 번째 진실이 되고,
        누가 상단바 높이를 바꾸면 미리보기만 조용히 어긋난다. 실물을
        렌더하면 따라온다. isGuest라 UnreadBadge(알림 개수 조회)가 렌더되지
        않으므로 미리보기가 쿼리를 쏘지 않고, 프레임이 inert라 링크도
        눌리지 않는다.

        이 띠가 없으면 스크롤 영역이 755px가 되어 홈(699px)과 갈리고,
        카드 하한이 홈 594 / 미리보기 642로 달라진다 — §5.10이 막으려는
        "편집기에서 통과시킨 문구가 홈에서는 넘친다"가 높이 축에서
        재현되는 것이다.
      */}
      {isVideo ? null : <TopBar isGuest />}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isVideo ? (
          <PostItem post={post} isGuest preview />
        ) : (
          <div className={CARD_SCROLL_ITEM}>
            <PostCard post={post} isGuest preview />
          </div>
        )}
      </div>
      <BottomNav />
    </Frame>
  );
}
