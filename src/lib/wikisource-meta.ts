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
  "저자 확인 불가",
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
 * 여기뿐이다.
 *
 * **저자를 못 읽는 원인을 실측으로 두 번 짚었다.** 표본 99개 검증에서는
 * 실패가 「강촌 (두보)」(한시 전용 틀) 1건으로 보였다. 하지만 그 표본에는
 * 영어 이름 틀이 하나도 없었고, 329편 전수 조사(2026-09-09)에서 실제
 * 원인은 **항목 이름 어휘 부족**이었다: `제목` 315 · `저자` 253 · `역자`
 * 245 · `지은이` 61 · `title` 13 · `author` 13 · `글쓴이` 1. 처음엔
 * `저자`·`지은이`만 알았고, 그래서 영어 이름 틀 13편 + `글쓴이` 1편 +
 * 머리말 틀 자체가 없는 「모비딕」 1편, 정확히 15편의 저자를 못 읽었다.
 *
 * 이 함수는 지금도 저자를 못 찾으면 `null`을 돌려준다(예: 「모비딕」). 다만
 * `scripts/sync-wikisource-works.mjs`는 그런 행을 표에 담지 않는다 — 저자는
 * 사망 연도·국적·금지 명단 세 검사의 입구라, 모르면 셋 다 판정할 수 없기
 * 때문이다. 그런 작품을 등록하려면 `/admin/books/import`에서 사람이 저자를
 * 직접 입력한다.
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
 * 처음에는 `/^PD-/`였는데 문서·주석·PRD §11-65가 모두 `PD-old-*`라고 적어
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
 * 이 문서를 `wikisource_works` 표에 담을지의 **첫 관문**을 판정한다 —
 * 장르·하위 문서·친일문학·PD 태그, 이 네 가지만 본다.
 *
 * **이 함수 하나가 "표에 담을지"의 전부가 아니다.** 저자 기준(사망 연도·
 * 국적)은 `checkAuthor`·`eraConsistent`가 별도로 맡는다 — 2026-09-09 브랜치
 * 전체 검토가 찾은 문제가 정확히 이 오해였다: PD 태그(위키문헌의 판단)만
 * 보고 저자 기준(PRD §5.11, 우리 기준)을 따로 거르지 않은 채 통과시키고
 * 있었다. 지금은 이 함수를 통과한 행에 `checkAuthor`·`eraConsistent`까지
 * 통과해야 표에 실제로 남는다.
 *
 * **금지 저작자는 지금도 표에 남기고 화면에서만 가린다** — `book-rights.ts`의
 * `isListable`이 그쪽을 맡는다. 저자 문서 기준만으로는 손으로 쓴 명단을
 * 대체할 수 없다(실측: 「저자:정지용」은 1950년 사망·북한 분류 없음으로
 * 기계 검사를 통과하지만 명단이 막는다 — 지금도 정지용의 작품 3편이 표에는
 * 남고 화면에서만 가려진다). 표에서 지우면 "왜 이 작품이 목록에 없나"에
 * 답할 수 없다.
 *
 * **번역물도 `isListable`이 계속 검사하지만, 이제는 거의 발동하지 않는다.**
 * 번역물은 원저자가 외국인인 경우가 대부분이라(예: 「전쟁과 평화」→ 레프
 * 톨스토이) `checkAuthor`의 「해외 저자」가 표 단계에서 먼저 걸러낸다 —
 * 293개 표에 `translator`가 있는 행은 0건이다. 검사를 지우지 않는 이유는
 * 한국인이 만료된 한국 저자를 번역한 경우까지는 저자 검사로 잡을 수
 * 없어서다.
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

/**
 * 한국 저자를 판정한다.
 *
 * **어휘는 실측으로 정했다** — 실제 위키문헌 저자 페이지에서 본 분류를 모두
 * 포함한다. 초기 정규식에 없던 선사·삼국시대 국호 두 개(`신라`, `고려`)를
 * 측정 중에 발견했다(최치원과 일연이 각각 그것으로 분류됨). 이전 왕조까지
 * 포함하도록 넓히는 것은 여닫힌 집합(이들이 전부인 한국 정치체)이라 위험이
 * 없다 — 더 넓은 매칭은 한국 저자가 한국인으로 인식되도록 할 수만 있고,
 * 역은 불가능하다.
 */
const KOREAN_AUTHOR = /^(고구려|백제|신라|가야|발해|고려|일제 강점기|대한민국|대한제국|조선|한국)의 (저자|소설가|시인)$/;
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
 * 이름 뒤에 붙은 괄호 주석을 뗀다 — 「김소월(김정식)」→「김소월」,
 * 「이정호(李定鎬)」→「이정호」.
 *
 * **이 파일의 `authorPageTitle`과 `src/lib/book-rights.ts`의
 * `blockedAuthorReason`이 이 규칙을 각자 따로 갖고 있었다** (브랜치 전체
 * 검토가 찾은 결함). 실측한 저자 이름에 괄호 형태가 있어(「김소월(김정식)」·
 * 「이정호(李定鎬)」) 둘 다 이 처리가 필요했는데, 두 벌로 나뉘어 있으면
 * 한쪽만 새 괄호 형태(예: 「정지용［鄭芝溶］」처럼 전각 대괄호)를 받도록
 * 넓혔을 때 실패하는 쪽이 **`book-rights.ts`의 금지 명단 조회**다 — 그
 * 조회가 놓치면 저자 문서 조회는 여전히 통과해 정지용이 그대로 등록
 * 가능한 것으로 판정된다. 실측: 「저자:정지용」은 1950년 사망·북한 분류
 * 없음으로 `checkAuthor`를 그대로 통과하고, 그를 막는 지식은 오직
 * `book-rights.ts`의 손으로 쓴 명단뿐이다. 두 곳이 같은 함수 하나를
 * 부르면 이 갈라짐이 원천적으로 불가능해진다.
 */
export function stripAuthorAnnotation(name: string): string {
  return name.replace(/\s*[(（].*$/, "").trim();
}

/**
 * 저자 이름에서 저자 문서 제목을 만든다.
 *
 * 괄호와 그 뒤는 떼낸다 — 실측한 저자 이름에 「김소월(김정식)」·
 * 「이정호(李定鎬)」처럼 괄호를 단 형태가 있고, 저자 문서는 괄호 없는
 * 이름으로 존재한다.
 */
export function authorPageTitle(author: string): string {
  return "저자:" + stripAuthorAnnotation(author);
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

/**
 * 발표 연도가 저자의 생애와 맞물리는지 본다 — **엉뚱한 저자 문서를 물었는지
 * 걸러내는 마지막 방어선**이다.
 *
 * `authorPageTitle`은 이름의 첫 괄호 앞만 잘라 저자 문서 제목을 만들 뿐,
 * 받아온 문서가 정말 그 사람인지는 아무것도 확인하지 않는다. 문서가 아예
 * 없으면 `checkAuthor`가 「저자 문서 없음」으로 안전하게 배제하지만, **존재
 * 하는 다른 사람의 문서**를 잘못 물면 그 문서가 우연히 한국인이고 1962년
 * 이전 사망이기만 하면 그대로 통과해 버린다. 실측: 머리말은 저자를
 * 「로버트 스티븐슨」으로 적었는데 실제 저자 문서는 「저자:로버트 루이스
 * 스티븐슨」이다 — 이번엔 축약형 문서가 아예 없어 안전하게 걸렸지만,
 * 위키문헌이 동명이인 구분 방식(`이름 (구분)`)으로 바뀌면 다음번엔
 * 존재하는 다른 사람의 문서를 물게 될 수 있다.
 *
 * 발표 연도가 저자의 생애 밖이면 신뢰할 수 없다는 신호로 본다:
 * - 출생 이전 발표는 불가능하다.
 * - 사후 발표는 흔하다 — 윤동주(1945년 사망)의 작품은 1948년·1979년에도
 *   나왔다 — 그래서 넉넉하게 50년을 허용한다. 그보다 멀면 아예 다른
 *   시대의 저자를 짚었다고 본다.
 *
 * 판단할 근거가 없으면(발표 연도 미상이거나 저자 생몰년을 둘 다 모르면)
 * 통과시킨다 — 「모른다」를 배제로 바꾸지 않는다. 사망 연도를 모르는 경우는
 * 이미 `checkAuthor`의 「사망 연도 불명」이 따로 배제한다.
 */
export function eraConsistent(
  pubYear: number | null,
  info: AuthorInfo,
): boolean {
  if (pubYear === null) return true;
  if (info.born === null && info.died === null) return true;
  if (info.born !== null && pubYear < info.born) return false;
  if (info.died !== null && pubYear > info.died + 50) return false;
  return true;
}

/** 행에 저장된 저자 판정의 근거. 화면이 이것으로 규칙을 다시 적용한다. */
export type StoredAuthorFacts = {
  author_born: number | null;
  author_died: number | null;
  author_is_korean: boolean | null;
  author_is_north_korean: boolean | null;
};

/**
 * 저장된 행이 **지금의** 규칙을 여전히 만족하는지 다시 판정한다.
 *
 * 동기화 시점의 승인을 렌더 시점의 승인으로 바꾸는 함수다. 금지 저작자
 * 명단은 이미 화면에서 매번 확인되는데(`isListable`) 사망 연도·국적·장르·
 * 태그는 행에 얼어붙어 있었다 — 기준을 바꿔 배포하면 화면이 낡은 승인으로
 * 「가져오기」를 계속 내놓고, `books`에 초안 상태가 없어 한 번 누르면 즉시
 * 공개된다.
 *
 * `stale`이 참이면 「이 작품이 원래 안 되는 것」이 아니라 「검증이 지금
 * 기준과 어긋나거나 아예 없다 — 동기화가 필요하다」는 뜻이다. 관리자가 할
 * 일이 다르므로 갈라 준다. (지금 구현에서는 실패 경로가 전부 이 뜻이라
 * `stale`이 항상 참이다 — 저장된 사실이 지금 규칙에 못 미치는 경우와 애초에
 * 검증한 적 없는 경우, 둘 다 답은 "동기화를 다시 돌려라"이기 때문이다.)
 *
 * **`author_born`은 null 가드에 넣지 않는다.** `checkAuthor`는 `born`을
 * 아예 보지 않고, `eraConsistent`는 생몰년이 둘 다 없을 때만 무조건
 * 통과시킬 뿐 `died`만 있어도 그것으로 판단한다 — 즉 `born`이 없는 것은
 * "검증 안 됨"이 아니라 저자 문서에 원래 생년 분류가 없는, 흔한 정상
 * 상태다. 이걸 가드에 넣으면 사망 연도까지 멀쩡히 확인된 행을 "동기화가
 * 필요하다"로 잘못 분류한다. 반대로 `author_died`·`author_is_korean`·
 * `author_is_north_korean`은 `checkAuthor`가 판정에 반드시 써야 하는
 * 값이라 하나라도 없으면 판정 자체가 불가능하다 — 그게 바로 마이그레이션
 * 직후 기존 293행의 상태다.
 */
export function reverifyStored(
  row: { genre: string; pd_tag: string; pub_year: number | null } & StoredAuthorFacts,
): { ok: true } | { ok: false; reason: string; stale: boolean } {
  if (
    row.author_died === null ||
    row.author_is_korean === null ||
    row.author_is_north_korean === null
  ) {
    return {
      ok: false,
      reason: "저자 검증값이 없습니다 — 동기화를 다시 돌려야 합니다",
      stale: true,
    };
  }

  const info: AuthorInfo = {
    born: row.author_born,
    died: row.author_died,
    isKorean: row.author_is_korean,
    isNorthKorean: row.author_is_north_korean,
    missing: false,
  };

  const verdict = checkAuthor(info);
  if (!verdict.ok) {
    return {
      ok: false,
      reason: `${verdict.reason} — 규칙이 바뀌었으니 동기화를 다시 돌려야 합니다`,
      stale: true,
    };
  }

  if (!eraConsistent(row.pub_year, info)) {
    return {
      ok: false,
      reason: "발표 연도가 저자 생애와 어긋납니다 — 동기화를 다시 돌려야 합니다",
      stale: true,
    };
  }

  if (!(SCOPE_GENRES as readonly string[]).includes(row.genre)) {
    return {
      ok: false,
      reason: `범위 밖 장르(${row.genre}) — 규칙이 바뀌었으니 동기화를 다시 돌려야 합니다`,
      stale: true,
    };
  }

  if (!PD_TAG.test(row.pd_tag)) {
    return {
      ok: false,
      reason: `저작권 태그(${row.pd_tag})가 지금 조건에 맞지 않습니다 — 동기화를 다시 돌려야 합니다`,
      stale: true,
    };
  }

  return { ok: true };
}
