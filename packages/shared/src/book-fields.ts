import type { FeedBook } from "@ttokttok/shared/feed";

/**
 * 도서 시트(`BookSheet`)가 읽는 도서 필드 전부 — **여기서만 선언한다.**
 *
 * 왜 한 곳이어야 하나: 시트는 피드·탐색·보관함·어드민 미리보기 네 경로에서
 * 열리는데, 각자 자기 SELECT 목록을 들고 있었다. 그래서 `quote`·`quote_source`가
 * 피드에만 추가되고 탐색·보관함에는 빠진 채로 배포됐고, **같은 책인데
 * 피드에서 열면 인용구가 보이고 보관함에서 열면 사라졌다** — PRD §11-41이
 * "어떤 게시물에서 열어도 같은 도서면 같은 내용을 본다"고 못박은 바로 그것을
 * 어긴 상태였다.
 *
 * 왜 타입 검사가 못 잡았나: supabase-js가 select 문자열을 타입 수준에서
 * 파싱하긴 하지만, 조회 결과를 `as unknown as FeedBook`으로 캐스팅하는 순간
 * 그 파싱 결과와 `FeedBook` 사이의 연결이 끊긴다. 그래서 목록을 합치는
 * 것만으로는 다음에 또 갈라진다 — `FeedBook`에 필드를 더하고 이 목록에
 * 안 더하는 순간 조용히 같은 일이 반복된다.
 *
 * 그래서 목록을 배열로 두고 `keyof FeedBook`에 양방향으로 묶었다:
 *   - 여기 없는 컬럼을 적으면 → `satisfies`가 막는다
 *   - `FeedBook`에 필드를 더하고 여기 안 더하면 → 아래 완전성 검사가 막는다
 * 컴파일이 통과하는 한 이 목록과 `FeedBook`은 어긋날 수 없다.
 *
 * **좁은 목록을 따로 두는 것은 여전히 옳다.** `activity.ts`는 커버 그리드가
 * 실제로 읽는 3개 필드만 고르는데(시트를 열지 않는다), RSC 플라이트
 * 페이로드에 최대 50건이 실리기 때문이다. 그런 곳은 `Pick<FeedBook, ...>`로
 * 타입을 좁혀 짝을 맞춘다 — 이 목록을 쓰지 않는다.
 */
const BOOK_FIELDS = [
  "id",
  "title",
  "author",
  "translator",
  "publisher",
  "cover_url",
  "category",
  "isbn",
  "page_count",
  "pub_date_paper",
  "pub_date_ebook",
  "intro",
  "quote",
  "quote_source",
  "toc",
  "epub_path",
  "purchase_links",
] as const satisfies readonly (keyof FeedBook)[];

/**
 * 위 목록에서 빠진 `FeedBook` 필드. 항상 `never`여야 한다.
 * 비지 않으면 바로 아래 상수의 타입이 그 필드 이름이 되어 `= true`가 깨진다 —
 * 즉 **필드를 더하고 목록에 안 넣으면 컴파일이 실패한다.** 이 파일이
 * 존재하는 이유가 그것이다.
 */
type MissingBookField = Exclude<keyof FeedBook, (typeof BOOK_FIELDS)[number]>;

const _allBookFieldsSelected: [MissingBookField] extends [never]
  ? true
  : MissingBookField = true;
void _allBookFieldsSelected;

/** 배열을 구분자로 이어 붙인 **리터럴 타입**. */
type Join<T extends readonly string[], Sep extends string> = T extends readonly [
  infer Head extends string,
  ...infer Rest extends string[],
]
  ? Rest extends readonly []
    ? Head
    : `${Head}${Sep}${Join<Rest, Sep>}`
  : "";

/**
 * PostgREST `select()`에 넣는 형태. 중첩 임베드에도 그대로 쓴다:
 * `` .select(`percent, books ( ${BOOK_SELECT} )`) ``
 *
 * `as`가 붙은 이유: supabase-js는 select 문자열을 **타입 수준에서 파싱**해
 * 결과 모양을 만든다. `join()`의 반환 타입인 그냥 `string`을 주면 그 파서가
 * `ParserError`를 뱉으며 호출부 전체의 타입이 깨진다. 런타임 값과 어긋날
 * 여지는 없다 — 같은 배열, 같은 구분자에서 나온다.
 */
export const BOOK_SELECT = BOOK_FIELDS.join(", ") as Join<
  typeof BOOK_FIELDS,
  ", "
>;
