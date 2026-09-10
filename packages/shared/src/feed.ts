/** 영역 하나의 저장값. variant가 없으면 레지스트리 defaultVariant로 폴백. */
export type FeedRegionValue = {
  variant?: string | null;
  text?: string | null;
};


/**
 * 카드 게시물 본문 한 장 (PRD §5.2).
 * 템플릿 키가 영역 구성·순서를 정하고, regions에는 영역별 유형·텍스트만
 * 담긴다 — 도서에서 오는 값은 렌더 시점에 books에서 읽는다.
 */
export type FeedCardLayout = {
  background?: import('./card-background').CardBackground | null;
  template: string;
  regions: Record<string, FeedRegionValue>;
};


export type FeedBook = {
  id: string;
  title: string;
  author: string;
  translator: string | null;
  publisher: string | null;
  cover_url: string | null;
  category: string;
  isbn: string | null;
  page_count: number | null;
  pub_date_paper: string | null;
  pub_date_ebook: string | null;
  intro: string | null;
  /** 대표 인용구 — 도서 시트 2번째 섹션 (PRD §5.12). 없으면 섹션 생략. */
  quote: string | null;
  quote_source: string | null;
  toc: string[];
  /** 전문 도서 판별 (PRD §11-29). NOT NULL이면 뷰어 대상, NULL이면 링크형. */
  epub_path: string | null;
  purchase_links: Record<string, string> | null;
};


export type FeedChannel = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
};


export type FeedVideo = {
  source_type: "upload" | "youtube";
  video_path: string | null;
  youtube_id: string | null;
  duration_sec: number | null;
};


export type FeedPost = {
  id: string;
  type: "cards" | "video";
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  books: FeedBook;
  channels: FeedChannel;
  /** 카드 게시물일 때만 채워진다 (post_id가 PK인 1:1 상세 테이블). */
  post_cards: FeedCardLayout | null;
  /** 영상 게시물일 때만 채워진다 (PRD §5.3). */
  post_videos: FeedVideo | null;
};


/**
 * 페이지 경계 (get_feed_v4).
 *
 * token은 해석하지 않는다 — DB가 만든 문자열을 그대로 돌려보내기만 하는
 * 불투명 값이다. 점수를 숫자로 주고받으면 JSON 직렬화에서 자릿수가 깎여
 * 페이지가 겹치거나 게시물이 통째로 건너뛰어진다 (마이그레이션
 * 20260828000002).
 *
 * id는 점수가 같은 게시물의 동점을 가른다 — 없으면 둘 중 하나가 영영
 * 나오지 않는다.
 *
 * token에는 점수뿐 아니라 **점수의 시간 기준점(as_of)**도 들어 있다
 * (`<점수>|<as_of>`, 마이그레이션 20260907000001, PRD §11-59). 그래서 이
 * 값은 단순한 페이지 경계가 아니라 "이 페이지네이션이 어느 시점의 세상을
 * 보고 있는가"이기도 하다 — 다른 페이지네이션의 커서를 섞어 쓰거나 오래
 * 들고 있던 커서를 재사용하면 그 시점의 점수로 계산된다. 여기서도
 * 해석하지 않는다.
 */
export type FeedCursor = { token: string; id: string };


export type FeedPage = {
  posts: FeedPost[];
  /** 다음 페이지 요청에 그대로 넘긴다. null이면 끝. */
  nextCursor: FeedCursor | null;
  /**
   * RPC·본문 조회가 실패했는가 (notifications.ts의 getNotifications와
   * 같은 이유로 둔다). posts가 빈 배열인 경우가 "정말 게시물이 없다"와
   * "불러오다 실패했다" 둘 다일 수 있는데, 실패를 빈 배열로 감추면 화면이
   * 사용자에게 거짓말을 한다 — 카드 목록이 있어야 할 자리가 그냥 백지가
   * 된다. 호출부(page.tsx·feed-actions.tsx)가 이 값으로 두 경우를
   * 구분해 다른 문구를 보여준다.
   */
  failed: boolean;
};


/** 게시물 유형. posts.type의 체크 제약과 같은 값이다. */
export type PostType = "cards" | "video";
