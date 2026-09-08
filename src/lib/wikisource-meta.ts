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

export type ExclusionReason =
  | "범위 밖 장르"
  | "하위 문서"
  | "친일문학"
  | "PD 태그 없음";

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
 * **줄 단위로 읽고 `=` 주변은 `[ \t]*`만 허용한다.** 항목 값은 줄바꿈으로
 * 끝나므로 `\s*`를 쓰면 줄바꿈을 먹고 다음 줄을 값으로 끌어온다 — 빈
 * `|역자 =`가 다음 줄 `|부제 = `를 집어삼켜 99개 중 60개를 번역물로
 * 오판했던 실제 오류다.
 */
const HEADER_TITLE = /^[ \t]*\|[ \t]*제목[ \t]*=[ \t]*(.*)$/m;
const HEADER_AUTHOR = /^[ \t]*\|[ \t]*(?:저자|지은이)[ \t]*=[ \t]*(.*)$/m;
const HEADER_TRANSLATOR = /^[ \t]*\|[ \t]*역자[ \t]*=[ \t]*(.*)$/m;

/**
 * 위키 링크에서 이름을 뽑는다.
 *
 * `[^|\]]`로 대상명을 끊는 것이 핵심이다 — `[^|}\n]*` 같은 패턴은 링크
 * **안의** 파이프에서 잘려 `[[저자:현진건`을 값으로 남긴다.
 */
const LINK = /\[\[(?:저자:)?([^|\]]+)(?:\|([^\]]*))?\]\]/;

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

/** 위키문헌 저작권 태그 — `PD-old-50`·`PD-old-70`·`PD-old-80` 등. */
const PD_TAG = /^PD-/;

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
