"use client";

import { useQuery } from "@tanstack/react-query";
import { PostItem } from "@/components/feed/post-item";
import { BottomNav } from "@/components/layout/bottom-nav";
import { createClient } from "@/lib/supabase/client";
import type { FeedBook, FeedCardLayout, FeedPost } from "@/lib/feed";

/** 카드와 하단 도서바가 읽는 필드 전부. lib/feed.ts의 SELECT와 같은 목록이다. */
const BOOK_COLUMNS = `
  id, title, author, translator, publisher, cover_url, category, isbn,
  page_count, pub_date_paper, pub_date_ebook, intro, quote, quote_source,
  toc, epub_path, purchase_links
`;

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
    .select(BOOK_COLUMNS)
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

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border w-fit overflow-hidden rounded-xl border shadow-sm">
      {/*
        375×812를 정확히 지켜야 한다. 테두리를 이 박스에 걸면 box-sizing이
        border-box라 내용 폭이 373px가 되어 미리보기가 거짓말을 한다 —
        그래서 테두리는 바깥 래퍼가 갖는다.

        inert는 하위 트리의 포인터·키보드·포커스를 브라우저 수준에서
        막는다. ActionBar는 record_share RPC와 analytics를 실제로 호출하므로
        미리보기에서 눌리면 집계가 오염된다. pointer-events-none은 키보드로
        뚫리지만 inert는 뚫리지 않는다.
      */}
      <div
        inert
        className="bg-background flex h-[812px] w-[375px] flex-col"
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
 * 사용자 화면을 흉내 내지 않고 **같은 컴포넌트를 그대로 쓴다**. PostItem을
 * 임포트하고 (main) 레이아웃과 같은 박스 구조로 감싸므로, 마크업이나
 * 클래스가 한쪽만 바뀌어 어긋날 여지가 없다.
 *
 * 이 설계에는 규약이 따라붙는다: 카드 컴포넌트에 부수효과를 넣으면
 * 미리보기가 그것을 실행한다 (FRONTEND.md §3).
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

  return (
    <Frame>
      {/*
        (main) 레이아웃과 같은 박스다: min-h-0 flex-1로 남은 높이를 주고
        하단 GNB가 그 아래를 차지한다. main 태그를 쓰지 않는 이유는 어드민
        레이아웃에 이미 main이 있어 두 개가 되기 때문이다.
      */}
      <div className="min-h-0 flex-1">
        <PostItem post={post} isGuest preview />
      </div>
      <BottomNav />
    </Frame>
  );
}
