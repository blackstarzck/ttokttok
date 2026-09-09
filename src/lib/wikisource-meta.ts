/**
 * @file 위키문헌이 주는 메타데이터를 우리 값으로 바꾼다 (설계: 2026-09-08).
 *
 * **`import "server-only"`를 넣지 말 것.** `scripts/sync-wikisource-works.mjs`와
 * vitest(node 환경)가 이 파일을 import한다 — `server-only`는 react-server 조건
 * 밖에서 던져 둘 다 깨진다. `src/lib/wikisource.ts`가 같은 이유로 그렇게 되어 있다.
 */

/**
 * 목록에 담을 장르 — 소설 계열과 시집 (사용자 결정).
 *
 * **배열 순서가 우선순위다.** 한 문서에 장르가 둘 이상 붙는 경우가 실측 17건
 * 있고(「단편소설」+「한국의 소설」 등), 표의 한 칸에는 하나만 적어야 한다.
 * 구체적인 것이 앞이다 — 「소설」·「한국의 소설」은 다른 장르가 없을 때만 쓴다.
 */
export const SCOPE_GENRES = [
  "장편소설",
  "중편소설",
  "단편소설",
  "역사소설",
  "신소설",
  "추리소설",
  "한국의 소설",
  "소설",
  "시집",
] as const;

export type WorkGenre = (typeof SCOPE_GENRES)[number];

/** 시 계열 — `books.category`가 「시」가 되는 장르. */
const POETRY_GENRES: readonly WorkGenre[] = ["시집"];

/**
 * 후보에서 제외되는 사유 전부.
 *
 * 배열로 두는 이유: `scripts/sync-wikisource-works.mjs`가 사유별 집계 객체를
 * 이것으로 만든다. 스크립트는 `.mjs`라 타입 검사가 없어서, 손으로 적은
 * 거울을 두면 사유를 하나 더할 때 보고가 조용히 `NaN`이 된다.
 */
export const EXCLUSION_REASONS = [
  "범위 밖 장르",
  "하위 문서",
  "친일문학",
  "PD 태그 없음",
  "저자 불명",
  "저자 문서 없음",
  "해외 저자",
  "북한 저자",
  "1962년 이후 사망",
  "사망 연도 불명",
] as const;

export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export type WorkMeta = {
  genre: WorkGenre | null;
  pubYear: number | null;
  pdTag: string | null;
  isSubpage: boolean;
  isCollaborationist: boolean;
};

/**
 * `머리말` 틀을 추출한다.
 *
 * 한시(한시) 템플릿 같은 다른 템플릿과 구별하기 위해 머리말 블록만 추출한다.
 */
const HEADER_BLOCK = /\{\{머리말\n([\s\S]*?)\n\}\}/;

/**
 * `머리말` 틀의 항목을 읽는 정규식.
 *
 * **항목 이름은 실측으로 정했다** (329편 전수, 2026-09-09):
 * 제목 315 · 저자 253 · 역자 245 · 지은이 61 · title 13 · author 13 · 글쓴이 1.
 * 처음에는 `저자`·`지은이`만 봤고 — 표본 30개에서 나온 어휘였다 — 그래서
 * 영어 이름 틀 13편과 `글쓴이` 1편의 저자를 못 읽었다. 저자 null 15편이
 * 그것으로 정확히 설명된다 (13 + 1 + 머리말 틀이 없는 「모비딕」 1).
 *
 * **`역자`는 유일한 역자 항목 이름이다** (`번역자`·`translator` 없음). 다만
 * 영어 이름 틀에는 역자 항목이 **아예 없다** — 그 13편은 머리말로 번역물
 * 여부를 판정할 수 없고, 그래서 저자 쪽 검사가 필요하다.
 *
 * 줄 단위로 읽고 `=` 주변은 `[ \t]*`만 허용한다. 항목 값은 줄바꿈으로
 * 끝나므로 `\s*`를 쓰면 다음 줄을 값으로 끌어온다.
 */
const HEADER_TITLE = /^[ \t]*\|[ \t]*(?:제목|title)[ \t]*=[ \t]*(.*)$/im;
const HEADER_AUTHOR = /^[ \t]*\|[ \t]*(?:저자|지은이|글쓴이|author)[ \t]*=[ \t]*(.*)$/im;
const HEADER_TRANSLATOR = /^[ \t]*\|[ \t]*역자[ \t]*=[ \t]*(.*)$/m;

/**
 * 위키 링크에서 이름을 뽑는다.
 *
 * 이름공간 접두사는 실측한 둘을 모두 떼낸다 — `저자:`(308) · `글쓴이:`(28).
 * 표시명이 있으면 대개 문제가 없지만, 없는 링크에서는 접두사가 값에 남아
 * 「글쓴이:김만중」이 저자 이름이 된다.
 *
 * `[^|\]]`로 대상명을 끊는 것이 핵심이다 — `[^|}\n]*` 같은 패턴은 링크
 * **안의** 파이프에서 잘려 `[[저자:현진건`을 값으로 남긴다.
 */
const LINK = /\[\[(?:저자:|글쓴이:)?([^|\]]+)(?:\|([^\]]*))?\]\]/;

function headerValue(wikitext: string, pattern: RegExp): string | null {
  const matched = pattern.exec(wikitext);
  if (!matched) return null;

  const raw = matched[1].trim();
  if (!raw) return null;

  const link = LINK.exec(raw);
  if (!link) return raw;

  // 표시명(파이프 뒤)이 있으면 그것을, 없으면 대상명을 쓴다.
  return link[2]?.trim() || link[1].trim() || null;
}

/**
 * 위키텍스트의 `머리말` 틀에서 제목·저자·역자를 뽑는다.
 *
 * ws-export가 만드는 EPUB에는 `dc:creator`가 아예 없어(§11-49) 저자의 원천이
 * 여기뿐이다. 표본 99개에서 저자 추출 98/99 — 실패는 「강촌 (두보)」로 한시
 * 전용 틀을 쓴다. 그런 문서는 저자가 null로 남고 목록에서 `—`로 보인다.
 */
export function parseHeader(wikitext: string): {
  title: string | null;
  author: string | null;
  translator: string | null;
} {
  // 머리말 블록을 먼저 추출한다. 없으면 전부 null.
  const blockMatch = HEADER_BLOCK.exec(wikitext);
  const headerBlock = blockMatch ? blockMatch[0] : "";

  return {
    title: headerValue(headerBlock, HEADER_TITLE),
    author: headerValue(headerBlock, HEADER_AUTHOR),
    translator: headerValue(headerBlock, HEADER_TRANSLATOR),
  };
}

/**
 * 저작권 태그 — **나이 만료 계열만** 받는다 (`PD-old`, `PD-old-50`, `PD-old-100` …).
 *
 * 처음에는 `/^PD-/`였는데 문서·주석·PRD §11-64가 모두 `PD-old-*`라고 적어
 * 놓은 것보다 넓었다. 실측으로 두 건이 그 틈으로 들어왔다: 「파초」는
 * `PD-공유마당`(나이 만료가 아니라 이용 허락 기반이라 PRD §5.11의 「권리
 * 확보분」에 해당한다), 「자유종」은 `PD-old-95-US`(미국 기준이라 한국법에
 * 대해 말하는 바가 없다).
 */
const PD_TAG = /^PD-old(-\d+)?$/;

/** 출간 연도 분류. `연도 미입력 작품`은 데이터 품질 표시라 여기 걸리지 않는다. */
const PUB_YEAR = /^(\d{4})년 작품$/;

/**
 * 분류 목록에서 장르·연도·저작권 태그·제외 표시를 뽑는다.
 *
 * @param categories `prop=categories`가 준 값. `분류:` 접두사는 있어도 없어도 된다.
 */
export function parseCategories(categories: readonly string[]): WorkMeta {
  const names = categories.map((c) => c.replace(/^분류:/, "").trim());
  const set = new Set(names);

  // SCOPE_GENRES 순서가 우선순위다 — find가 앞의 것을 먼저 집는다.
  const genre = SCOPE_GENRES.find((g) => set.has(g)) ?? null;

  const years = names
    .map((c) => PUB_YEAR.exec(c)?.[1])
    .filter((y): y is string => Boolean(y))
    .map(Number);

  // PD 태그가 둘 이상이면 정렬해 첫 것을 쓴다. Set의 순회 순서는 API가 준
  // 순서라 실행마다 달라질 수 있고, 그러면 같은 문서가 동기화마다 다른
  // pd_tag로 저장돼 아무 의미 없는 갱신이 발생한다.
  const pdTag = names.filter((c) => PD_TAG.test(c)).sort()[0] ?? null;

  return {
    genre,
    pubYear: years.length ? Math.min(...years) : null,
    pdTag,
    isSubpage: set.has("하위 문서"),
    isCollaborationist: set.has("친일문학"),
  };
}

/**
 * 이 문서를 `wikisource_works` 표에 담을지 판정한다.
 *
 * **표에 담을지와 목록에 보일지는 다른 질문이다.** 금지 저작자와 번역물은
 * 표에 남기고 화면에서만 가린다 — `book-rights.ts`의 `isListable`이 그쪽을
 * 맡는다. 표에서 지우면 "왜 이 작품이 목록에 없나"에 답할 수 없다.
 *
 * 검사 순서는 설계 문서의 실측치를 센 순서다. 바꾸면 동기화 보고의 사유별
 * 집계가 그 숫자와 어긋난다.
 */
export function isCandidate(
  meta: WorkMeta,
): { ok: true } | { ok: false; reason: ExclusionReason } {
  if (!meta.genre) return { ok: false, reason: "범위 밖 장르" };
  if (meta.isSubpage) return { ok: false, reason: "하위 문서" };
  if (meta.isCollaborationist) return { ok: false, reason: "친일문학" };
  if (!meta.pdTag) return { ok: false, reason: "PD 태그 없음" };
  return { ok: true };
}

/**
 * 위키문헌 장르를 `books.category` 값으로 옮긴다.
 *
 * 위키문헌은 `단편소설`처럼 세분하고 우리는 `소설`·`시` 둘로 쓴다
 * (실측: 기존 16권이 `소설` 12 · `시` 4). 범위를 소설 계열·시집으로
 * 좁혔으므로 **`books.category`에 새 값이 생기지 않는다**.
 */
export function toBookCategory(genre: WorkGenre): "소설" | "시" {
  return POETRY_GENRES.includes(genre) ? "시" : "소설";
}

/** 저자 문서 분류. `년년`은 위키문헌 틀의 오타이고 실제 분류 이름이 그렇다. */
const DIED = /^(\d{4})년년? 죽음$/;
const BORN = /^(\d{4})년년? 태어남$/;
const KOREAN_AUTHOR = /^(일제 강점기|대한민국|대한제국|조선|한국)의 (저자|소설가|시인)$/;
const NORTH_KOREAN = /조선민주주의인민공화국/;

/** PRD §5.11 — 저작자가 이 해 **이전에** 사망해야 한다. */
export const PUBLIC_DOMAIN_DEATH_BEFORE = 1962;

export type AuthorInfo = {
  born: number | null;
  died: number | null;
  isKorean: boolean;
  isNorthKorean: boolean;
  missing: boolean;
};

/**
 * 저자 이름에서 저자 문서 제목을 만든다.
 *
 * 괄호와 그 뒤는 떼낸다 — 실측한 저자 이름에 「김소월(김정식)」·
 * 「이정호(李定鎬)」처럼 괄호를 단 형태가 있고, 저자 문서는 괄호 없는
 * 이름으로 존재한다.
 */
export function authorPageTitle(author: string): string {
  return "저자:" + author.replace(/\s*[(（].*$/, "").trim();
}

export function parseAuthorPage(
  categories: readonly string[],
  missing: boolean,
): AuthorInfo {
  const names = categories.map((c) => c.replace(/^분류:/, "").trim());
  const year = (re: RegExp) => {
    const hit = names.map((c) => re.exec(c)?.[1]).find(Boolean);
    return hit ? Number(hit) : null;
  };
  return {
    born: year(BORN),
    died: year(DIED),
    isKorean: names.some((c) => KOREAN_AUTHOR.test(c)),
    isNorthKorean: names.some((c) => NORTH_KOREAN.test(c)),
    missing,
  };
}

/**
 * 저자를 근거로 등록 가능한지 판정한다 — **PRD §5.11을 그대로 구현한다.**
 *
 * 위키문헌의 `PD-old-*` 태그는 그들의 판단이고 우리 기준이 아니다. 우리
 * 기준은 「저작자가 1962년 이전 사망」이며, 저자 문서의 사망 연도가 그
 * 값이다. 태그는 후보를 모으는 그물로만 남는다.
 *
 * **손으로 쓴 금지 명단을 대체하지 않는다.** 실측: 「저자:정지용」은 1950년
 * 사망으로 적혀 있고 북한 분류도 없어 이 검사를 통과한다. 그를 막는 지식은
 * `src/lib/book-rights.ts`의 명단에만 있다. 두 검사를 함께 거친다.
 */
export function checkAuthor(
  info: AuthorInfo,
): { ok: true } | { ok: false; reason: ExclusionReason } {
  if (info.missing) return { ok: false, reason: "저자 문서 없음" };
  if (!info.isKorean) return { ok: false, reason: "해외 저자" };
  if (info.isNorthKorean) return { ok: false, reason: "북한 저자" };
  if (info.died === null) return { ok: false, reason: "사망 연도 불명" };
  if (info.died >= PUBLIC_DOMAIN_DEATH_BEFORE) {
    return { ok: false, reason: "1962년 이후 사망" };
  }
  return { ok: true };
}
