/**
 * @file 위키문헌 목록 화면의 질의 계층 — 검색·필터·정렬·페이지 (설계: 2026-09-08).
 *
 * **행을 전부 받아 메모리에서 거른다** (실측 293행, 2026-09-09 — 저작권
 * 태그만으로 걸렀던 최초 설계 시점은 329행이었다). SQL로 밀지 않는 이유:
 * ① `sort` 파라미터를 `.order()`에 넣으면 주입면이 되고, 공백·괄호가 든
 * 제목(「진달래꽃 (시집)」)을 `.not(…,"in",…)`에 넣으려면 인용 규칙과
 * 씨름해야 한다 ② 이 저장소의 테스트 정책은 순수 함수만이라 SQL로 밀면
 * 이 계층 전체가 테스트 밖으로 나간다 ③ `Intl.Collator("ko")`가 Postgres
 * 기본 콜레이션보다 한국어 정렬을 확실히 한다 ④ 금지 저작자를 SQL로
 * 거르려면 이름 정규화(NFC·폭 없는 문자)를 SQL에 한 벌 더 만들어야 한다.
 *
 * 수천 행이 되면 이 판단이 바뀐다 — 신호는 화면 응답이 느껴질 만큼 느려지는 것.
 */

import { isListable } from "@/lib/book-rights";
import { SCOPE_GENRES, type WorkGenre } from "@/lib/wikisource-meta";

/** 한 쪽에 담는 수. 293개면 6쪽이다. */
export const PAGE_SIZE = 50;

export const SORT_KEYS = ["title", "author", "genre", "year"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** `wikisource_works`에서 화면이 읽는 컬럼. */
export type WorkRow = {
  page_title: string;
  title: string;
  author: string | null;
  genre: WorkGenre;
  pub_year: number | null;
  translator: string | null;
};

export type CatalogueQuery = {
  q: string;
  genre: WorkGenre | null;
  /** 1920 = 1920~1929년. */
  decade: number | null;
  /** 출간 연도가 없는 것만 본다. */
  noYear: boolean;
  sort: SortKey;
  dir: "asc" | "desc";
  /** 1부터 센다. */
  page: number;
  hideRegistered: boolean;
  /** 켜면 등록 불가(금지 저작자·번역물)도 사유와 함께 보인다. */
  showUnlistable: boolean;
};

type Param = string | string[] | undefined;

/** 같은 키가 두 번 오면 배열이 된다 — 그런 입력은 없는 것으로 본다. */
const one = (v: Param): string => (typeof v === "string" ? v : "");

const flag = (v: Param): boolean => one(v) === "1";

export function parseCatalogueQuery(sp: Record<string, Param>): CatalogueQuery {
  const rawSort = one(sp.sort);
  const rawGenre = one(sp.genre);
  const rawDecade = one(sp.decade);

  const page = Number.parseInt(one(sp.page), 10);

  return {
    q: one(sp.q).trim(),

    // 화이트리스트다. 모르는 값은 조용히 기본값으로 되돌린다 — 오류를 띄우면
    // 링크를 잘못 만든 우리 실수가 관리자에게 배너로 튄다.
    genre: (SCOPE_GENRES as readonly string[]).includes(rawGenre)
      ? (rawGenre as WorkGenre)
      : null,

    decade: /^\d{3,4}0$/.test(rawDecade) ? Number(rawDecade) : null,
    noYear: rawDecade === "none",

    sort: (SORT_KEYS as readonly string[]).includes(rawSort)
      ? (rawSort as SortKey)
      : "title",
    dir: one(sp.dir) === "desc" ? "desc" : "asc",

    page: Number.isFinite(page) && page >= 1 ? page : 1,

    hideRegistered: flag(sp.hide),
    showUnlistable: flag(sp.all),
  };
}

/** 화면이 받는 한 행 — 후보 정보에 등록 여부와 가림 사유를 붙인 것. */
export type CatalogueRow = WorkRow & {
  /** 이미 등록된 작품이면 `books.id`. */
  bookId: string | null;
  /** 등록 불가 사유. 채워진 행은 `showUnlistable`을 켰을 때만 보인다. */
  blockedReason: string | null;
};

/** 한국어 정렬. Postgres 기본 콜레이션에 맡기지 않는 이유가 이것이다. */
const collator = new Intl.Collator("ko");

/**
 * 빈 값을 방향과 무관하게 끝으로 보내는 비교자.
 *
 * 내림차로 정렬했더니 `—`가 위에 몰리면 표가 쓸모없어진다. 그래서 null
 * 판정을 방향 반전 **밖에서** 한다.
 */
function compareValues(
  a: string | number | null,
  b: string | number | null,
  dir: "asc" | "desc",
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const sign = dir === "desc" ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return collator.compare(String(a), String(b)) * sign;
}

function sortValue(row: WorkRow, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return row.title;
    case "author":
      return row.author;
    case "genre":
      return row.genre;
    case "year":
      return row.pub_year;
  }
}

/**
 * 두 행의 정렬 순서를 정한다 — 정렬 키가 같으면 `page_title`로 마저 가른다.
 *
 * `page.tsx`의 Supabase 조회에는 `.order()`가 없어 Postgres가 주는 행
 * 순서는 애초에 보장이 없고, 동기화의 upsert가 표를 다시 쓸 때마다 물리적
 * 순서가 또 바뀐다. `sort=genre`는 값이 8종류뿐이고 `sort=year`는 동률이
 * 흔해서(293행 다수가 같은 10년대) 동률 안의 순서가 사실상 화면 순서를
 * 지배한다 — 동률을 그대로 두면 3쪽을 보던 관리자가 동기화 뒤 「다음」을
 * 눌렀을 때 같은 행을 두 번 보거나 어떤 행에도 영영 닿지 못할 수 있다.
 *
 * `page_title`은 표의 기본 키라 항상 유일하다(마이그레이션 주석) — 그래서
 * 이 비교자를 거치면 동률이 완전히 사라져 정렬이 데이터베이스가 주는
 * 순서와 무관하게 결정된다. 방향과 무관하게 항상 오름차로 고정한다:
 * 동률 안에서까지 방향을 뒤집으면 정렬 방향을 바꿀 때마다 "다음 쪽 첫
 * 행"이 예측할 수 없이 흔들린다.
 */
function compare(a: WorkRow, b: WorkRow, key: SortKey, dir: "asc" | "desc"): number {
  const primary = compareValues(sortValue(a, key), sortValue(b, key), dir);
  if (primary !== 0) return primary;
  return compareValues(a.page_title, b.page_title, "asc");
}

/**
 * 후보 행을 걸러 정렬하고 한 쪽을 잘라 준다.
 *
 * @param rows `wikisource_works` 전체 (실측 293행, 2026-09-09)
 * @param registered `page_title` → `books.id`. `books.source_ref`로 짝지어 만든다
 */
export function applyCatalogueQuery(
  rows: readonly WorkRow[],
  query: CatalogueQuery,
  registered: ReadonlyMap<string, string>,
): { rows: CatalogueRow[]; total: number; pageCount: number; page: number } {
  const needle = query.q.toLowerCase();

  const matched = rows
    .map((row): CatalogueRow => {
      const listable = isListable(row);
      return {
        ...row,
        bookId: registered.get(row.page_title) ?? null,
        blockedReason: listable.ok ? null : listable.reason,
      };
    })
    .filter((row) => {
      if (row.blockedReason && !query.showUnlistable) return false;
      if (query.hideRegistered && row.bookId) return false;
      if (query.genre && row.genre !== query.genre) return false;

      if (query.noYear && row.pub_year !== null) return false;
      if (query.decade !== null) {
        if (row.pub_year === null) return false;
        if (row.pub_year < query.decade || row.pub_year >= query.decade + 10) {
          return false;
        }
      }

      if (needle) {
        // 저자는 타입상 null일 수 있다(스키마가 허용한다). 실제로는 지금
        // 어떤 행도 null이 아니다 — 저자를 못 읽은 문서는 동기화가 표에
        // 담지 않는다(어휘 정정 뒤 유일한 예였던 「모비딕」도 이제 표에
        // 없다). 그래도 검색이 이 값에 기대 죽지 않도록 방어한다.
        const haystack = `${row.title} ${row.author ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    })
    .sort((a, b) => compare(a, b, query.sort, query.dir));

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 6쪽을 보다가 필터를 걸면 결과가 1쪽으로 줄 수 있다. 그때 빈 표를
  // 보여주면 관리자는 "필터에 걸리는 게 없다"로 읽는다 — 실제로는 있다.
  const page = Math.min(query.page, pageCount);
  const from = (page - 1) * PAGE_SIZE;

  return { rows: matched.slice(from, from + PAGE_SIZE), total, pageCount, page };
}

/**
 * `page_title`을 제목 옆 괄호로 보여줄 행의 `page_title` 집합을 계산한다.
 *
 * 괄호를 붙이는 이유는 「진달래꽃」(낱편 시)과 「진달래꽃 (시집)」처럼 같은
 * 표시 제목(`title`)을 가진 두 행을 구별하기 위해서다. 그런데 표시 제목에는
 * 대개 한자 병기가 이미 붙어 있어(예: 「그날이 오면」 → 「(詩歌隨筆)
 * 그날이 오면」), 겹치는 행이 하나도 없을 때도 `page_title`을 무조건
 * 붙이면 「(詩歌隨筆) 그날이 오면(그날이 오면)」·「12월 12일(十二月
 * 十二日)(12월 12일)」·「가애자(可愛者)(가애자)」처럼 잡음만 된다.
 *
 * 그래서 **같은 화면에 실제로 보이는 다른 행과 표시 제목이 겹칠 때만**
 * `page_title`을 보여준다. 반드시 페이지네이션 **이후**, 즉 실제로
 * 그려지는 행(`applyCatalogueQuery`가 돌려주는 `result.rows`)을 넘겨야
 * 한다 — 다른 쪽에 있는 동명 작품과는 같은 화면에 없으므로 구별할 필요가
 * 없다.
 *
 * `page_title === title`인 행(원문 그대로가 표시 제목인 경우)은 겹치더라도
 * 제외한다 — 자기 자신과 똑같은 문자열을 괄호로 또 보여주는 것은 그
 * 자체로 잡음이다.
 */
export function pageTitlesToDisambiguate(
  rows: readonly Pick<WorkRow, "title" | "page_title">[],
): ReadonlySet<string> {
  const titleCounts = new Map<string, number>();
  for (const row of rows) {
    titleCounts.set(row.title, (titleCounts.get(row.title) ?? 0) + 1);
  }

  const show = new Set<string>();
  for (const row of rows) {
    if (row.page_title === row.title) continue;
    if ((titleCounts.get(row.title) ?? 0) > 1) show.add(row.page_title);
  }
  return show;
}

/** 필터 선택지를 실제 데이터에서 만든다 — 손으로 적은 목록은 데이터와 어긋난다. */
export function decadeOptions(rows: readonly WorkRow[]): {
  decades: number[];
  hasNoYear: boolean;
} {
  const decades = new Set<number>();
  let hasNoYear = false;

  for (const row of rows) {
    if (row.pub_year === null) hasNoYear = true;
    else decades.add(Math.floor(row.pub_year / 10) * 10);
  }

  return { decades: [...decades].sort((a, b) => a - b), hasNoYear };
}

/** 같은 컬럼을 다시 누르면 방향을 뒤집고, 다른 컬럼이면 오름차로 시작한다. */
export function nextSortDir(query: CatalogueQuery, key: SortKey): "asc" | "desc" {
  if (query.sort !== key) return "asc";
  return query.dir === "asc" ? "desc" : "asc";
}

const CATALOGUE_PATH = "/admin/books/wikisource";

/**
 * 현재 상태에 `patch`를 얹은 주소를 만든다.
 *
 * 기본값인 항목은 넣지 않는다 — 주소가 사람이 읽을 수 있게 남고, 같은
 * 화면이 여러 주소를 갖지 않는다.
 *
 * **필터가 바뀌면 쪽 번호를 1로 되돌린다.** 6쪽을 보다가 장르를 고르면
 * 결과가 1쪽뿐일 수 있고, 쪽 번호를 물고 가면 빈 표가 뜬다.
 */
export function buildCatalogueHref(
  query: CatalogueQuery,
  patch: Partial<CatalogueQuery>,
): string {
  const next: CatalogueQuery = { ...query, ...patch };

  const keys = Object.keys(patch);
  const onlyPageChanged = keys.length > 0 && keys.every((k) => k === "page");
  if (!onlyPageChanged) next.page = 1;

  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.genre) params.set("genre", next.genre);
  if (next.noYear) params.set("decade", "none");
  else if (next.decade !== null) params.set("decade", String(next.decade));
  if (next.sort !== "title") params.set("sort", next.sort);
  if (next.dir !== "asc") params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.hideRegistered) params.set("hide", "1");
  if (next.showUnlistable) params.set("all", "1");

  const qs = params.toString();
  return qs ? `${CATALOGUE_PATH}?${qs}` : CATALOGUE_PATH;
}
