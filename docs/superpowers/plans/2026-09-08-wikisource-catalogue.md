# 위키문헌 작품 목록 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위키문헌에서 가져올 수 있는 소설·시집 329편을 어드민 표로 보여주고, 행의 「가져오기」 한 번으로 등록한다.

**Architecture:** 후보 목록을 우리 DB(`wikisource_works`)에 두고, 화면은 우리 DB만 읽는다. 위키문헌 API는 사람이 드물게 돌리는 동기화 스크립트에서만 호출한다 — 레이트 리밋이 세서 화면이 직접 부를 수 없다. 검색·필터·정렬·페이지는 **행을 전부 받아 순수 함수로 처리한다**(329행). 「가져오기」는 이미 동작하는 `importFromWikisource` 서버 액션을 숨은 필드로 재사용한다.

**Tech Stack:** Next.js 16 App Router (서버 컴포넌트, 서버 액션), Supabase Postgres + RLS, Tailwind v4 + shadcn/ui `Table`, vitest (순수 함수만), MediaWiki Action API (동기화 스크립트), Node 24 타입 스트리핑(`.mjs`가 `.ts`를 import).

**설계 문서:** `docs/superpowers/specs/2026-09-08-wikisource-catalogue-design.md` — 실측 숫자와 판단 근거가 전부 여기 있다. 이 계획이 설계와 어긋나 보이면 설계를 먼저 읽는다.

## Global Constraints

- **개발용 DB가 없다.** 개발과 운영이 Supabase 프로젝트 하나(`jrabwetgciulczhnoxxi`)를 공유한다. 마이그레이션·스크립트는 **곧 운영을 바꾼다**. 쓰기 전에 사용자에게 알리고 동의를 받는다.
- **`supabase db push`를 실행하지 않는다.** 다른 세션의 미적용 마이그레이션을 함께 밀어버린다. 마이그레이션 파일은 만들어 두고 **사용자가 Supabase 대시보드에서 적용**한다.
- **`npm run seed`를 실행하지 않는다.** 시드된 게시물의 `like_count`·`view_count`를 되돌린다.
- **테스트는 순수 함수만** (`vitest.config.ts`, `environment: "node"`). Supabase 쿼리 빌더를 모킹한 테스트는 만들지 않는다. 렌더와 네트워크 경로는 `npm run build` + 375px 수동 확인이 맡는다 (FRONTEND.md §7).
- **`src/lib/wikisource-meta.ts`와 `src/lib/book-rights.ts`는 `import "server-only"`를 쓰지 않는다.** `.mjs` 스크립트와 vitest(node 환경)가 이 파일을 import한다 — `server-only`는 react-server 조건 밖에서 던져 둘 다 깨진다. `src/lib/wikisource.ts`가 같은 이유로 그렇게 되어 있다.
- **스타일은 시맨틱 토큰만** (`bg-background`, `text-muted-foreground`). 원시 hex·px·Tailwind 팔레트 직접 참조 금지 (DESIGN.md).
- **URL 상태는 `searchParams`.** 전역 스토어 도입 금지 (FRONTEND.md §4).
- **위키문헌 API 호출 규칙** (실측으로 세 번 차단당해 정한 값): `User-Agent`는 식별 가능한 값, **순차 요청**(병렬 금지), 요청 사이 **최소 2초**, 묶음 크기 **20개**, 제한 응답이면 **10초 → 20초 → 30초 → 40초 → 50초 백오프로 최대 5회 재시도**.
- **완료 기준**: `npm run build` 통과(타입체크 포함), `npm test` 통과, 화면 작업은 375px에서 실제 렌더 확인.
- **커밋 메시지는 한국어**, 기존 저장소 문체를 따른다(무엇을 왜 바꿨는지, 판단 근거).
- 마이그레이션 번호는 작업 시점에 `ls supabase/migrations/ | tail -1`로 확인한다. 이 계획 작성 시점의 마지막은 `20260907000001_feed_score_freeze.sql`이라 새 파일은 `20260908000001_wikisource_works.sql`이다. master가 움직였으면 그에 맞춘다.
- PRD §11 결정 기록의 마지막 번호는 **60**이다. 새 항목은 **§11-61**. 작업 시점에 `grep -o "^| [0-9]\+ |" docs/prd-ttokttok.md | tr -d '| ' | sort -n | tail -1`로 재확인한다.

---

## 파일 구조

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `src/lib/wikisource-meta.ts` | 위키텍스트 `머리말` 파싱, 분류 파싱, 후보 판정, 장르→`books.category` 변환. **순수 함수만** | 신규 |
| `src/lib/wikisource-meta.test.ts` | 위 파일의 테스트. 픽스처는 실측한 실제 모양 | 신규 |
| `src/lib/book-rights.ts` | 등록 금지 저작자 명단, 이름 정규화, 목록 노출 판정. 임포트 액션과 목록 화면이 **같은 명단**을 본다 | 신규 |
| `src/lib/book-rights.test.ts` | 위 파일의 테스트 | 신규 |
| `src/lib/wikisource-catalogue.ts` | 목록 화면의 질의 계층 — searchParams 파싱·화이트리스트, 행 필터·정렬·페이지, 링크 생성. **순수 함수만** | 신규 |
| `src/lib/wikisource-catalogue.test.ts` | 위 파일의 테스트 | 신규 |
| `supabase/migrations/20260908000001_wikisource_works.sql` | `wikisource_works` 표 + RLS | 신규 |
| `scripts/sync-wikisource-works.mjs` | 위키문헌에서 후보를 받아 표를 채운다. `--dry-run` 필수 | 신규 |
| `package.json` | `wikisource:sync` 스크립트 추가 | 수정 |
| `src/app/admin/(dashboard)/books/wikisource/page.tsx` | 목록 화면 (서버 컴포넌트) | 신규 |
| `src/app/admin/(dashboard)/books/import/actions.ts` | 금지 명단을 `book-rights.ts`에서 가져오고, 오류 복귀 화면을 `from`으로 가른다 | 수정 |
| `src/app/admin/(dashboard)/books/import/page.tsx` | `?source=`·`?category=` 선입력을 받는다 | 수정 |
| `src/app/admin/(dashboard)/books/page.tsx` | 헤더 버튼을 목록 화면으로 바꾼다 | 수정 |
| `docs/prd-ttokttok.md` | §5.10 갱신 + 결정 기록 §11-61 | 수정 |

**왜 `wikisource-meta`와 `wikisource-catalogue`를 나누는가:** 앞은 *위키문헌이 주는 것*을 해석하고(스크립트가 쓴다), 뒤는 *우리 화면이 보여줄 것*을 정한다(화면이 쓴다). 한 파일에 두면 스크립트가 화면의 페이지네이션 코드를 끌고 들어온다. 둘 다 순수 함수라 테스트가 쉽다.

**왜 `wikisource.ts`에 넣지 않는가:** 그 파일은 EPUB 바이트를 다루고 893줄이다. 메타데이터 파싱은 다른 책임이고, `fflate` 의존이 없다.

---

### Task 1: 위키문헌 메타데이터 파싱 (`wikisource-meta.ts`)

위키문헌이 주는 두 가지를 우리 값으로 바꾼다: 문서의 **분류 목록**(장르·연도·저작권 태그·제외 표시)과 **위키텍스트**(제목·저자·역자). 순수 함수이므로 이 Task가 이 계획에서 테스트가 가장 촘촘한 곳이다.

**설계 근거:** 파싱을 실제로 **세 번 틀렸다.** 설계 문서 「저자는 본문 머리말 틀에서 나온다」에 경위가 있다. 단순화한 픽스처가 그 세 오류를 하나도 잡지 못했으므로, 아래 테스트의 픽스처는 **실측한 실제 모양**을 쓴다.

**Files:**
- Create: `src/lib/wikisource-meta.ts`
- Test: `src/lib/wikisource-meta.test.ts`

**Interfaces:**
- Consumes: 없음 (이 계획의 첫 Task, 의존 없음)
- Produces:
  - `SCOPE_GENRES: readonly WorkGenre[]` — 목록에 담을 장르 9종, **우선순위 순서**
  - `type WorkGenre = "장편소설" | "중편소설" | "단편소설" | "역사소설" | "신소설" | "추리소설" | "한국의 소설" | "소설" | "시집"`
  - `type ExclusionReason = "범위 밖 장르" | "하위 문서" | "친일문학" | "PD 태그 없음"`
  - `parseHeader(wikitext: string): { title: string | null; author: string | null; translator: string | null }`
  - `parseCategories(categories: readonly string[]): WorkMeta` where `type WorkMeta = { genre: WorkGenre | null; pubYear: number | null; pdTag: string | null; isSubpage: boolean; isCollaborationist: boolean }`
  - `isCandidate(meta: WorkMeta): { ok: true } | { ok: false; reason: ExclusionReason }`
  - `toBookCategory(genre: WorkGenre): "소설" | "시"`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — `parseHeader`**

`src/lib/wikisource-meta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseHeader } from "@/lib/wikisource-meta";

/**
 * 실측한 실제 위키텍스트 (「운수 좋은 날」, prop=revisions).
 * 단순화하지 않는다 — 값이 줄바꿈으로 끝난다는 사실이 파싱 규칙을 지배하고,
 * 그 사실을 지운 픽스처가 실제 오류 세 개를 하나도 잡지 못했다.
 */
const 운수좋은날 = `{{머리말
|제목 = 운수 좋은 날
|지은이 = [[저자:현진건|현진건]]
|역자 =
|부제 =
}}

새침하게 흐린 품이 눈이 올 듯하더니 눈은 아니 오고 얼다가 만 비가 내리었다.`;

/** 실측: 「가던 길 멈춰서」 — 표본 99개 중 유일한 번역물. */
const 번역물 = `{{머리말
|제목 = 가던 길 멈춰서
|저자 = [[윌리엄 데이비스]]
|역자 = [[사용자:pk0001|pk0001]]
|부제 =
}}`;

/** 실측: 항목 이름이 `저자`인 쪽 (표본 30개 중 23). 링크에 파이프가 없다. */
const 파이프없는링크 = `{{머리말
|제목 = 날개
|저자 = [[저자:이상]]
}}`;

/** 실측: 「강촌 (두보)」 — 머리말 틀을 쓰지 않는 한시 문서. */
const 머리말없음 = `{{한시
|제목 = 강촌
}}
淸江一曲抱村流`;

describe("parseHeader", () => {
  it("지은이 항목에서 저자를 뽑는다", () => {
    expect(parseHeader(운수좋은날)).toEqual({
      title: "운수 좋은 날",
      author: "현진건",
      translator: null,
    });
  });

  it("저자 항목 이름도 인식한다 — 위키문헌이 둘을 섞어 쓴다", () => {
    expect(parseHeader(파이프없는링크).author).toBe("이상");
  });

  /**
   * 표시명과 대상명이 **다른** 픽스처여야 이 테스트가 뜻을 갖는다.
   * 「운수 좋은 날」은 `[[저자:현진건|현진건]]`로 둘이 같아서, 어느 쪽을
   * 집어도 통과한다 — 그 픽스처로는 아무것도 확인하지 못한다.
   */
  it("링크에 파이프가 있으면 표시명을 쓴다", () => {
    expect(parseHeader(`{{머리말\n|저자 = [[저자:김정식|김소월]]\n}}`).author).toBe(
      "김소월",
    );
  });

  /**
   * 실제로 틀렸던 경우 ①: `[^|}\n]*`로 값을 끊으면 링크 **안의 파이프**에서
   * 잘려 `[[저자:현진건`이 된다.
   */
  it("링크 안의 파이프에서 값을 끊지 않는다", () => {
    expect(parseHeader(운수좋은날).author).not.toContain("[[");
    expect(parseHeader(운수좋은날).author).not.toContain("저자:");
  });

  /**
   * 실제로 틀렸던 경우 ②: `\s*`가 줄바꿈까지 먹어, 빈 `|역자 =`가 다음 줄
   * `|부제 = `를 값으로 끌어왔다. 99개 중 60개가 번역물로 오판됐다.
   */
  it("빈 역자 항목이 다음 줄을 값으로 끌어오지 않는다", () => {
    expect(parseHeader(운수좋은날).translator).toBeNull();
  });

  it("역자가 채워져 있으면 뽑는다 — 번역물 판정의 근거다", () => {
    expect(parseHeader(번역물).translator).toBe("pk0001");
    expect(parseHeader(번역물).author).toBe("윌리엄 데이비스");
  });

  it("머리말 틀이 없으면 전부 null", () => {
    expect(parseHeader(머리말없음)).toEqual({
      title: null,
      author: null,
      translator: null,
    });
  });

  it("빈 문자열을 견딘다", () => {
    expect(parseHeader("")).toEqual({ title: null, author: null, translator: null });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test -- src/lib/wikisource-meta.test.ts
```

기대: FAIL — `Failed to resolve import "@/lib/wikisource-meta"`

- [ ] **Step 3: `parseHeader`를 구현한다**

`src/lib/wikisource-meta.ts`:

```ts
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
  return {
    title: headerValue(wikitext, HEADER_TITLE),
    author: headerValue(wikitext, HEADER_AUTHOR),
    translator: headerValue(wikitext, HEADER_TRANSLATOR),
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm test -- src/lib/wikisource-meta.test.ts
```

기대: PASS (8 tests)

- [ ] **Step 5: 실패하는 테스트를 쓴다 — `parseCategories`·`isCandidate`·`toBookCategory`**

`src/lib/wikisource-meta.test.ts` 끝에 덧붙인다. import 줄도 함께 고친다:

```ts
import {
  isCandidate,
  parseCategories,
  parseHeader,
  toBookCategory,
} from "@/lib/wikisource-meta";
```

```ts
/**
 * 실측한 분류 목록 (prop=categories). API는 `분류:` 접두사를 붙여 주므로
 * 픽스처도 붙인다 — 접두사를 지운 픽스처는 실제 입력이 아니다.
 */
const CATS = {
  운수좋은날: ["분류:1924년 작품", "분류:PD-old-50", "분류:단편소설"],
  님의침묵: ["분류:1926년 작품", "분류:PD-old-70", "분류:시집"],
  태평천하: ["분류:1938년 작품", "분류:PD-old-50", "분류:장편소설"],
  홍염: ["분류:1927년 작품", "분류:PD-old-70", "분류:연도 미입력 작품"],
  상록수: ["분류:1935년 작품", "분류:1936년 작품", "분류:PD-old-50", "분류:장편소설"],
  좌평성충: ["분류:PD-old-70", "분류:단편소설", "분류:하위 문서"],
  일장기의물결: ["분류:1942년 작품", "분류:PD-old-50", "분류:단편소설", "분류:친일문학"],
  고향_역: ["분류:1926년 작품", "분류:단편소설"],
  겹장르: ["분류:1925년 작품", "분류:PD-old-50", "분류:단편소설", "분류:한국의 소설"],
} as const;

describe("parseCategories", () => {
  it("장르·연도·PD 태그를 뽑는다", () => {
    expect(parseCategories(CATS.운수좋은날)).toEqual({
      genre: "단편소설",
      pubYear: 1924,
      pdTag: "PD-old-50",
      isSubpage: false,
      isCollaborationist: false,
    });
  });

  it("시집도 장르다", () => {
    expect(parseCategories(CATS.님의침묵).genre).toBe("시집");
  });

  it("연도가 둘이면 가장 이른 것을 쓴다", () => {
    expect(parseCategories(CATS.상록수).pubYear).toBe(1935);
  });

  /** 실측 17건. 표의 한 칸에는 하나만 적어야 하므로 우선순위로 고른다. */
  it("장르가 여러 개면 구체적인 것을 고른다", () => {
    expect(parseCategories(CATS.겹장르).genre).toBe("단편소설");
  });

  it("범위 밖 장르만 있으면 genre는 null", () => {
    expect(parseCategories(CATS.홍염).genre).toBeNull();
  });

  it("연도 분류가 없으면 pubYear는 null", () => {
    expect(parseCategories(["분류:PD-old-50", "분류:단편소설"]).pubYear).toBeNull();
  });

  it("PD 태그가 없으면 pdTag는 null", () => {
    expect(parseCategories(CATS.고향_역).pdTag).toBeNull();
  });

  it("하위 문서와 친일문학을 표시한다", () => {
    expect(parseCategories(CATS.좌평성충).isSubpage).toBe(true);
    expect(parseCategories(CATS.일장기의물결).isCollaborationist).toBe(true);
  });

  it("`분류:` 접두사가 없는 값도 견딘다", () => {
    expect(parseCategories(["단편소설", "PD-old-50"]).genre).toBe("단편소설");
  });

  it("빈 배열을 견딘다", () => {
    expect(parseCategories([])).toEqual({
      genre: null,
      pubYear: null,
      pdTag: null,
      isSubpage: false,
      isCollaborationist: false,
    });
  });

  /**
   * `연도 미입력 작품`은 데이터 품질 표시일 뿐 연도가 아니다.
   *
   * 「홍염」(`1927년 작품` + `연도 미입력 작품`)으로 확인하면 뜻이 없다 —
   * 옆에 진짜 연도가 있어서 1927이 나오는 것이 이 분류를 무시한 증거가
   * 되지 못한다. 이 분류만 있는 경우로 확인해야 한다.
   */
  it("연도 미입력 작품을 연도로 읽지 않는다", () => {
    expect(
      parseCategories(["분류:PD-old-50", "분류:단편소설", "분류:연도 미입력 작품"])
        .pubYear,
    ).toBeNull();
  });
});

describe("isCandidate", () => {
  it("장르·PD 태그가 있고 제외 표시가 없으면 후보다", () => {
    expect(isCandidate(parseCategories(CATS.운수좋은날))).toEqual({ ok: true });
  });

  it("범위 밖 장르는 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.홍염))).toEqual({
      ok: false,
      reason: "범위 밖 장르",
    });
  });

  /**
   * 장으로 쪼개진 문서를 목록에 두면 그것을 골라도 1장만 들어온다 —
   * 목록이 잘못된 선택을 유도한다. 실측 8건.
   */
  it("하위 문서를 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.좌평성충))).toEqual({
      ok: false,
      reason: "하위 문서",
    });
  });

  it("친일문학을 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.일장기의물결))).toEqual({
      ok: false,
      reason: "친일문학",
    });
  });

  it("PD 태그가 없으면 제외한다", () => {
    expect(isCandidate(parseCategories(CATS.고향_역))).toEqual({
      ok: false,
      reason: "PD 태그 없음",
    });
  });

  /**
   * 제외 사유의 우선순위를 못박는다. 설계 문서의 실측치(하위 문서 8 ·
   * 친일문학 2 · PD 태그 없음 26)가 이 순서로 센 값이라, 순서가 바뀌면
   * 동기화 보고와 설계 문서의 숫자가 어긋난다.
   */
  it("사유가 겹치면 장르 → 하위 문서 → 친일문학 → PD 순으로 보고한다", () => {
    expect(
      isCandidate({
        genre: "단편소설",
        pubYear: null,
        pdTag: null,
        isSubpage: true,
        isCollaborationist: true,
      }),
    ).toEqual({ ok: false, reason: "하위 문서" });
  });
});

describe("toBookCategory", () => {
  /**
   * 위키문헌은 `단편소설`이라 부르고 `books.category`는 `소설`을 쓴다
   * (실측: 기존 16권이 `소설` 12 · `시` 4). 범위를 좁힌 결과 새 값이
   * 생기지 않는다 — 기존 둘로 전부 덮인다.
   */
  it("소설 계열은 전부 소설", () => {
    for (const g of ["장편소설", "중편소설", "단편소설", "역사소설", "신소설", "추리소설", "한국의 소설", "소설"] as const) {
      expect(toBookCategory(g)).toBe("소설");
    }
  });

  it("시집은 시", () => {
    expect(toBookCategory("시집")).toBe("시");
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

```bash
npm test -- src/lib/wikisource-meta.test.ts
```

기대: FAIL — `parseCategories is not a function` (또는 import 오류)

- [ ] **Step 7: 나머지를 구현한다**

`src/lib/wikisource-meta.ts` 끝에 덧붙인다:

```ts
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
```

- [ ] **Step 8: 통과를 확인한다**

```bash
npm test -- src/lib/wikisource-meta.test.ts
```

기대: PASS (28 tests)

- [ ] **Step 9: 타입체크**

```bash
npm run build
```

기대: 성공. 이 Task는 아직 아무 화면도 건드리지 않았으므로 빌드가 깨지면 새 파일의 타입 문제다.

- [ ] **Step 10: 커밋**

```bash
git add src/lib/wikisource-meta.ts src/lib/wikisource-meta.test.ts
git commit -m "$(cat <<'EOF'
feat(wikisource): 문서 메타데이터 파싱을 순수 함수로 분리한다

분류 목록에서 장르·출간 연도·저작권 태그·제외 표시를 뽑고, 위키텍스트
머리말에서 제목·저자·역자를 뽑는다. 목록 화면과 동기화 스크립트가 같은
해석을 쓰도록 한 곳에 둔다.

파싱을 실제로 세 번 틀렸던 지점을 주석과 테스트로 못박았다. 링크 안의
파이프에서 값이 잘리는 것, `\s*`가 줄바꿈을 먹어 빈 `|역자 =`가 다음 줄을
값으로 끌어오는 것(99개 중 60개 오판), 그리고 장르가 겹칠 때의 우선순위다.
픽스처는 단순화하지 않고 실측한 실제 모양을 쓴다 — 단순화한 픽스처가 그
세 오류를 하나도 잡지 못했다.
EOF
)"
```

---

### Task 2: 등록 금지 저작자 명단을 공용 모듈로 (`book-rights.ts`)

지금 명단이 `books/import/actions.ts` 안의 모듈 private `Map`이다. 그 파일은 `"use server"`라 **export가 전부 서버 액션이 되므로** 목록 화면이 쓸 수 없다. 명단을 두 벌로 만들면 한쪽만 고쳐진다.

**Files:**
- Create: `src/lib/book-rights.ts`
- Test: `src/lib/book-rights.test.ts`
- Modify: `src/app/admin/(dashboard)/books/import/actions.ts` — 지역 `normalizeAuthorKey`·`BLOCKED_AUTHORS`를 지우고 import로 바꾼다

**Interfaces:**
- Consumes: 없음 (순수 함수, 의존 없음)
- Produces:
  - `normalizeAuthorKey(name: string): string`
  - `blockedAuthorReason(author: string | null | undefined): string | null`
  - `isListable(work: { author: string | null; translator: string | null }): { ok: true } | { ok: false; reason: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/book-rights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  blockedAuthorReason,
  isListable,
  normalizeAuthorKey,
} from "@/lib/book-rights";

describe("normalizeAuthorKey", () => {
  /**
   * `"정지용".normalize("NFD")`는 8개 코드 포인트다 — macOS Finder·클립보드
   * 경로가 한글을 자모 분해로 내놓는다. 정규화하지 않으면 금지 저작자가
   * 조용히 통과한다. 이건 우회를 막는 관문이 아니라 실수로 새는 걸 막는
   * 관문이라, 놓치는 쪽이 진짜 실패다.
   */
  it("NFD로 분해된 한글을 NFC로 모은다", () => {
    expect(normalizeAuthorKey("정지용".normalize("NFD"))).toBe("정지용");
  });

  it("폭 없는 문자를 걷어낸다", () => {
    // 눈에 보이지 않는 문자는 픽스처에서도 이스케이프로 쓴다.
    expect(normalizeAuthorKey("정지\u200B용")).toBe("정지용");
  });

  it("공백을 걷어낸다 — 「김 기림」이 「김기림」과 같은 키가 된다", () => {
    expect(normalizeAuthorKey("김 기림")).toBe("김기림");
    expect(normalizeAuthorKey("  백석  ")).toBe("백석");
  });
});

describe("blockedAuthorReason", () => {
  it("월북·납북 작가를 이유와 함께 돌려준다", () => {
    expect(blockedAuthorReason("정지용")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("이태준")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("박태원")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("홍명희")).toMatch(/월북·납북/);
    expect(blockedAuthorReason("김기림")).toMatch(/월북·납북/);
  });

  it("저작권이 존속하는 작가를 이유와 함께 돌려준다", () => {
    expect(blockedAuthorReason("백석")).toMatch(/1996년/);
    expect(blockedAuthorReason("박경리")).toMatch(/2008년/);
  });

  it("정규화가 필요한 입력도 잡는다", () => {
    expect(blockedAuthorReason("정지용".normalize("NFD"))).not.toBeNull();
    expect(blockedAuthorReason(" 김 기림 ")).not.toBeNull();
  });

  it("금지 목록에 없으면 null", () => {
    expect(blockedAuthorReason("현진건")).toBeNull();
    expect(blockedAuthorReason("김유정")).toBeNull();
  });

  it("null·undefined·빈 문자열을 견딘다", () => {
    expect(blockedAuthorReason(null)).toBeNull();
    expect(blockedAuthorReason(undefined)).toBeNull();
    expect(blockedAuthorReason("")).toBeNull();
  });

  /**
   * 객체 리터럴로 명단을 두면 `BLOCKED["constructor"]`가 함수를 반환해
   * "차단됨"으로 오판된다. Map이어야 하는 이유다.
   */
  it("프로토타입 키를 차단으로 오판하지 않는다", () => {
    expect(blockedAuthorReason("constructor")).toBeNull();
    expect(blockedAuthorReason("__proto__")).toBeNull();
    expect(blockedAuthorReason("toString")).toBeNull();
  });
});

describe("isListable", () => {
  it("금지 목록에 없고 번역물이 아니면 목록에 보인다", () => {
    expect(isListable({ author: "현진건", translator: null })).toEqual({ ok: true });
  });

  it("저자가 비어 있어도 목록에 보인다 — 가져올 때 입력받는다", () => {
    expect(isListable({ author: null, translator: null })).toEqual({ ok: true });
  });

  it("금지 저작자는 이유와 함께 가린다", () => {
    const r = isListable({ author: "박경리", translator: null });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/2008년/);
  });

  /** PRD §5.11: 원작이 만료여도 번역본은 별개다. */
  it("번역물은 이유와 함께 가린다", () => {
    const r = isListable({ author: "윌리엄 데이비스", translator: "pk0001" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/번역/);
  });

  it("금지 저작자이면서 번역물이면 저작자 사유를 먼저 보고한다", () => {
    const r = isListable({ author: "백석", translator: "누군가" });
    expect(r.ok === false && r.reason).toMatch(/1996년/);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test -- src/lib/book-rights.test.ts
```

기대: FAIL — `Failed to resolve import "@/lib/book-rights"`

- [ ] **Step 3: `book-rights.ts`를 구현한다**

`src/app/admin/(dashboard)/books/import/actions.ts`에 있는 주석을 **그대로 옮긴다** — 왜 `Map`인지, 왜 정규화가 필요한지가 그 주석에만 남아 있다.

`src/lib/book-rights.ts`:

```ts
/**
 * @file 등록 가능 여부의 단일 원천 (PRD §5.11).
 *
 * **`import "server-only"`를 넣지 말 것.** `scripts/sync-wikisource-works.mjs`와
 * vitest(node 환경)가 이 파일을 import한다.
 *
 * 이 파일이 있는 이유: 명단이 `books/import/actions.ts`의 모듈 private
 * 상수였고, 그 파일은 `"use server"`라 export가 전부 서버 액션이 되므로
 * 목록 화면이 쓸 수 없었다. 두 벌이 되면 한쪽만 고쳐진다.
 */

/**
 * 저작자 이름을 조회 키로 정규화한다.
 *
 * macOS Finder·클립보드 경로는 한글을 NFD(자모 분해)로 내놓기도 하고, 폭
 * 없는 문자(zero-width space 등)가 붙어 들어오기도 한다 — 둘 다 이 조회를
 * 조용히 실패시켜 금지 저작자를 그냥 통과시킨다. 이건 우회를 막는 관문이
 * 아니라 실수로 새는 걸 막는 관문이라, 놓치는 쪽이 진짜 실패다.
 *
 * 아래 목록의 키를 만들 때도, 입력을 조회할 때도 **반드시 이 함수 하나만**
 * 거친다 — 각자 따로 정규화하면 훗날 공백이 낀 이름("김 기림")이 한쪽에서만
 * 걸러져 서로 어긋나고, 차단해야 할 저작자가 조용히 통과한다.
 */
export function normalizeAuthorKey(name: string): string {
  // 폭 없는 문자는 반드시 \u 이스케이프로 쓴다 — 소스에 그대로 넣으면
  // 보이지 않아 나중에 아무도 이 문자 집합을 읽을 수 없다.
  return name.normalize("NFC").replace(/[\s\u200B\u200C\u200D\u00AD]/g, "");
}

/**
 * 등록 금지 저작자 (PRD §5.11).
 *
 * 위키문헌에 문서가 있다는 사실이 "공개해도 된다"로 오독되는 지점이
 * 여기다 — 위키문헌은 우리와 다른 기준으로 운영된다. 그래서 위키문헌
 * 경로(임포트·목록)에만 관문을 둔다. 수동 등록(saveBook)은 막지 않는다:
 * 손으로 적어 넣는 행위에는 이런 오독이 끼어들지 않는다.
 *
 * `Map`으로 두는 이유: 객체 리터럴이면 `BLOCKED_AUTHORS["constructor"]` 같은
 * 프로토타입 키 조회가 함수를 반환해 "차단됨"으로 오판된다.
 */
const BLOCKED_AUTHORS = new Map<string, string>(
  (
    [
      ["정지용", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["이태준", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["박태원", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["홍명희", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["김기림", "월북·납북 작가 — 사망 연도가 불확실합니다"],
      ["백석", "1996년 사망 — 저작권이 존속합니다 (사후 70년)"],
      ["박경리", "2008년 사망 — 저작권이 존속합니다 (사후 70년)"],
    ] as const
  ).map(([name, reason]) => [normalizeAuthorKey(name), reason] as const),
);

/** 금지 저작자면 사유를, 아니면 null. */
export function blockedAuthorReason(
  author: string | null | undefined,
): string | null {
  if (!author) return null;
  return BLOCKED_AUTHORS.get(normalizeAuthorKey(author)) ?? null;
}

/**
 * 후보를 목록에 **보일지** 판정한다.
 *
 * `wikisource-meta.ts`의 `isCandidate`가 "표에 담을지"를 정하고, 이 함수가
 * "화면에 보일지"를 정한다. 둘을 한 함수에 섞으면 표에서 지워야 할 것과
 * 가려야 할 것이 구별되지 않는다 — 표에서 지우면 "왜 이 작품이 목록에
 * 없나"를 나중에 DB에서 답할 수 없다.
 *
 * 저자가 비어 있는 것은 가리는 사유가 아니다. 「강촌 (두보)」처럼 다른 틀을
 * 쓰는 문서(99개 중 1개)는 목록에 남고, 가져올 때 저자를 입력받는다.
 */
export function isListable(work: {
  author: string | null;
  translator: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const blocked = blockedAuthorReason(work.author);
  if (blocked) return { ok: false, reason: `등록 금지 저작자 — ${blocked}` };

  // PRD §5.11: 원작의 저작권이 만료여도 번역본의 저작권은 별개다.
  if (work.translator) {
    return { ok: false, reason: `번역물 — 역자 ${work.translator}의 저작권이 별개입니다` };
  }

  return { ok: true };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm test -- src/lib/book-rights.test.ts
```

기대: PASS (16 tests)

- [ ] **Step 5: 임포트 액션이 공용 모듈을 쓰게 바꾼다**

`src/app/admin/(dashboard)/books/import/actions.ts`에서:

1. import에 한 줄 추가 (`@/lib/admin-guard` 아래):

```ts
import { blockedAuthorReason } from "@/lib/book-rights";
```

2. `normalizeAuthorKey` 함수 선언과 그 위 JSDoc **전체를 지운다**.
3. `BLOCKED_AUTHORS` 상수 선언과 그 위 JSDoc **전체를 지운다**.
4. 금지 검사 부분을 바꾼다. 기존:

```ts
  // 목록 쪽 키와 같은 함수로 정규화해야 어긋나지 않는다 (normalizeAuthorKey 참고).
  const authorKey = normalizeAuthorKey(author);
  const blocked = BLOCKED_AUTHORS.get(authorKey);
  if (blocked) {
```

바꾼 뒤:

```ts
  // 명단은 src/lib/book-rights.ts 하나다 — 목록 화면도 같은 것을 본다.
  const blocked = blockedAuthorReason(author);
  if (blocked) {
```

- [ ] **Step 6: 명단이 두 벌로 남지 않았는지 확인한다**

```bash
grep -rn "정지용\|BLOCKED_AUTHORS\|normalizeAuthorKey" src/ --include=*.ts --include=*.tsx
```

기대: `src/lib/book-rights.ts`와 `src/lib/book-rights.test.ts`에만 나온다. `books/import/actions.ts`에 남아 있으면 Step 5를 덜 한 것이다.

- [ ] **Step 7: 빌드와 전체 테스트**

```bash
npm run build
```

기대: 성공. `"use server"` 파일에서 export를 지운 것이므로, 실패하면 `normalizeAuthorKey`를 쓰는 다른 자리가 남은 것이다.

```bash
npm test
```

기대: 전부 PASS

- [ ] **Step 8: 임포트가 여전히 막는지 손으로 확인한다**

개발 서버를 띄우고 `/admin/books/import`에서 저자에 `박경리`를 넣어 제출한다. 문서 주소는 아무 값이나 좋다 — 금지 검사가 주소 파싱보다 먼저 온다.

```bash
npm run dev
```

기대 화면: `등록할 수 없는 저작자입니다: 「박경리」 — 2008년 사망 — 저작권이 존속합니다 (사후 70년) (PRD §5.11 등록 금지 목록).`

이 확인을 건너뛰지 않는다. 이 Task는 **이미 동작하는 안전장치를 옮기는** 작업이고, 옮기다 끊어져도 화면은 아무 오류를 내지 않는다 — 금지 저작자가 조용히 통과할 뿐이다. 테스트는 새 모듈이 옳다는 것만 말해 준다.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/book-rights.ts src/lib/book-rights.test.ts "src/app/admin/(dashboard)/books/import/actions.ts"
git commit -m "$(cat <<'EOF'
refactor(rights): 등록 금지 저작자 명단을 공용 모듈로 옮긴다

명단이 books/import/actions.ts의 모듈 private 상수였다. 그 파일은
"use server"라 export가 전부 서버 액션이 되므로 목록 화면이 그 명단을
읽을 수 없었다 — 뒤이어 만들 위키문헌 목록 화면이 같은 명단을 봐야 한다.
두 벌로 두면 한쪽만 고쳐진다.

목록에 보일지 판정하는 isListable을 같은 파일에 뒀다. 금지 저작자와
번역물은 표에는 남기고 화면에서만 가리므로, "표에 담을지"(wikisource-meta의
isCandidate)와 다른 질문이다.

이름 정규화가 필요한 이유와 Map을 쓰는 이유는 원래 주석을 그대로 옮겼다 —
그 판단 근거가 거기에만 남아 있었다.
EOF
)"
```

---

### Task 3: `wikisource_works` 표와 RLS

후보 목록을 우리 DB에 둔다. 365개를 화면 열 때마다 위키문헌에서 긁으면 요청이 20회 필요하고 레이트 리밋 때문에 분 단위로 걸린다 — 검색·정렬·필터도 위키문헌 API로는 할 수 없다.

**Files:**
- Create: `supabase/migrations/20260908000001_wikisource_works.sql`

**Interfaces:**
- Consumes: `public.is_admin()` (기존 함수, `20260827000001_init_schema.sql`)
- Produces: 표 `public.wikisource_works` — 이후 Task 5(동기화 스크립트)가 쓰고 Task 6(목록 화면)이 읽는다. 컬럼은 아래 SQL 그대로다.

- [ ] **Step 1: 마이그레이션 번호를 확인한다**

```bash
ls supabase/migrations/ | tail -3
```

기대: 마지막이 `20260907000001_feed_score_freeze.sql`. 다르면(master가 움직였으면) 그보다 큰 번호를 쓴다. **번호를 추측하지 않는다** — 앞선 작업에서 세 번 충돌했다.

- [ ] **Step 2: 마이그레이션을 쓴다**

`supabase/migrations/20260908000001_wikisource_works.sql`:

```sql
-- ============================================================
-- wikisource_works — 위키문헌에서 가져올 수 있는 작품 후보 목록
-- (PRD §5.10, 결정 기록 §11-61, 설계: docs/superpowers/specs/2026-09-08-*)
--
-- 왜 우리 표에 두는가: 후보는 실측 329개이고 위키문헌 API로 그걸 모으려면
-- 요청이 47회 필요하다. 위키문헌 레이트 리밋은 2초 간격에서도 걸릴 만큼
-- 세서(실측 3회 차단) 화면이 직접 부를 수 없다. 검색·정렬·필터도 위키문헌
-- API로는 안 된다. 사람이 드물게 돌리는 동기화 스크립트가 이 표를 채우고,
-- 화면은 우리 DB만 읽는다.
--
-- 이 표는 **후보지 계획이 아니다.** 329개 중 실제로 등록할 것은 수십 개다.
-- ============================================================

create table public.wikisource_works (
  -- 위키문헌 문서 제목. books.source_ref와 **같은 정규화**를 거친 형식이라
  -- (src/lib/wikisource.ts의 toPageTitle) 두 값을 바로 짝지어 "이미 등록됨"을
  -- 판정한다. 형식이 어긋나면 등록 여부 판정이 조용히 깨진다.
  page_title  text primary key,

  -- 표시용 제목. 머리말 틀의 `제목`, 없으면 page_title.
  title       text not null,

  -- 머리말 틀의 `저자`|`지은이`. 파싱 실패 시 null — 「강촌 (두보)」처럼
  -- 다른 틀을 쓰는 문서가 표본 99개 중 1개 있었다. 그런 행도 목록에 남기고
  -- 가져올 때 저자를 입력받는다.
  author      text,

  -- 소설 계열 또는 시집. 이 행이 표에 있는 근거이므로 not null.
  genre       text not null,

  -- 분류 "NNNN년 작품" 중 가장 이른 것. 「상록수」처럼 둘이 붙은 경우가 있다.
  pub_year    int,

  -- PD-old-50 등. 태그가 없는 문서는 표에 담지 않으므로 not null.
  --
  -- **이 태그는 위키문헌의 판단이고 우리 기준과 다르다.** 우리 기준은 PRD
  -- §5.11의 한국 저작권법(1962년 이전 사망)이며, 등록 금지 목록은 이 태그와
  -- 무관하게 따로 있다(src/lib/book-rights.ts). 태그는 후보를 모으는
  -- 그물일 뿐 등록 허가가 아니다.
  pd_tag      text not null,

  -- 머리말 틀의 `역자`. null이 아니면 번역물이다.
  --
  -- 번역물을 표에서 지우지 않고 여기 기록하는 이유: 나중에 "왜 이 작품이
  -- 목록에 없나"를 DB에서 답할 수 있다. 지우면 그 질문에 답할 수 없다.
  -- 목록 화면이 숨기는 것은 화면의 일이다 (src/lib/book-rights.ts의 isListable).
  translator  text,

  -- 언제 기준의 목록인지. 화면에 적는다 — 목록은 동기화 시점의 스냅숏이다.
  synced_at   timestamptz not null default now()
);

comment on table public.wikisource_works is
  '위키문헌에서 가져올 수 있는 작품 후보. scripts/sync-wikisource-works.mjs가 채운다.';

-- 인덱스는 지금 규모(329행)에서 실행 계획에 거의 영향이 없다. 그래도 필터로
-- 쓰는 세 컬럼에 두는 이유는 이 표가 커질 때(범위를 넓히면 PD 후보 전체가
-- 2,350개다) 손댈 곳을 남기지 않으려는 것이다. 검색(`q=`)은 부분 일치라
-- trigram 없이는 인덱스가 안 쓰이는데, 그건 규모가 커지는 시점에 pg_trgm으로
-- 해결할 문제다.
create index wikisource_works_genre_idx  on public.wikisource_works (genre);
create index wikisource_works_author_idx on public.wikisource_works (author);
create index wikisource_works_year_idx   on public.wikisource_works (pub_year);

-- ------------------------------------------------------------
-- RLS — 어드민 전용. books와 달리 읽기를 공개하지 않는다.
--
-- 이 표는 "아직 검토하지 않은 후보"다. 공개하면 우리가 등록 의사를 밝히지
-- 않은 작품 목록이 서비스 밖으로 나간다. 금지 저작자의 작품도 표에 남아
-- 있으므로(화면에서만 가린다) 더욱 그렇다.
-- ------------------------------------------------------------
alter table public.wikisource_works enable row level security;

create policy "wikisource_works_admin_read" on public.wikisource_works
  for select using (public.is_admin());

-- 쓰기 정책을 두지 않는다. 동기화 스크립트가 유일한 필자이고 service role은
-- RLS를 우회한다. 정책이 없으면 anon·authenticated는 쓰기가 전부 막힌다.
```

- [ ] **Step 3: 문장이 빠지지 않았는지 확인한다**

이 저장소는 로컬 Postgres가 없으므로 실행으로는 확인할 수 없다. 세어서 본다:

```bash
grep -c ";" supabase/migrations/20260908000001_wikisource_works.sql
```

기대: 7 — create table · comment · index 3 · alter · policy.

그리고 기존 파일과 관용구가 같은지 대조한다:

```bash
grep -n "enable row level security" supabase/migrations/20260827000003_rls_storage.sql | head -3
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260908000001_wikisource_works.sql
git commit -F- <<'MSG'
feat(db): 위키문헌 작품 후보 표를 만든다

후보 329개를 우리 DB에 둔다. 화면이 위키문헌 API를 직접 부를 수 없어서다 —
후보를 모으는 데 요청 47회가 필요하고, 레이트 리밋이 2초 간격에서도 걸릴
만큼 세다(실측 3회 차단). 검색·정렬·필터도 위키문헌 API로는 안 된다.

page_title이 기본 키다. books.source_ref와 같은 정규화를 거친 형식이라
두 값을 바로 짝지어 "이미 등록됨"을 판정한다.

읽기를 공개하지 않고 어드민 전용으로 둔다. 아직 검토하지 않은 후보 목록이고,
금지 저작자의 작품도 표에는 남아 있다(가리는 것은 화면의 일이다).
MSG
```

- [ ] **Step 5: 사용자에게 적용을 요청한다 — 직접 적용하지 않는다**

**`supabase db push`를 실행하지 않는다.** 다른 세션의 미적용 마이그레이션을 함께 밀어버린다. 그리고 개발용 DB가 따로 없어 이 적용은 **곧 운영을 바꾼다**.

사용자에게 이렇게 알린다:

> `supabase/migrations/20260908000001_wikisource_works.sql`을 Supabase 대시보드 SQL Editor에서 적용해 주세요. 새 표 하나를 만들 뿐 기존 데이터는 건드리지 않습니다. 적용 뒤 알려주시면 이어서 동기화 스크립트를 만듭니다.

적용됐다는 답을 받은 뒤 확인한다. 이 확인은 읽기뿐이라 운영에 아무 영향이 없다:

```bash
node --env-file=.env scripts/check-table.mjs wikisource_works
```

기대: `✓ 표 있음, 행 0개`

---

### Task 4: 목록 화면의 질의 계층 (`wikisource-catalogue.ts`)

검색·필터·정렬·페이지를 **순수 함수로** 처리한다. 329행을 전부 받아 메모리에서 거르는 쪽을 택했다 — 이유:

- **주입면이 사라진다.** `sort` 파라미터를 그대로 `.order()`에 넣으면 PostgREST 주입면이 되고, 「진달래꽃 (시집)」처럼 공백·괄호가 든 제목을 `.not("page_title","in",…)`에 넣으려면 인용 규칙과 씨름해야 한다.
- **테스트가 가능해진다.** 이 저장소의 테스트 정책은 순수 함수만이다. SQL로 밀면 이 계층 전체가 테스트 밖으로 나간다.
- **한국어 정렬이 맞는다.** `Intl.Collator("ko")`가 Postgres 기본 콜레이션보다 확실하다.
- **쪽 크기가 어긋나지 않는다.** 금지 저작자 숨기기를 SQL로 하려면 이름 정규화를 SQL에 옮겨야 하고(NFC·폭 없는 문자), 그러면 정규화가 두 벌이 된다. JS에서만 거르면서 SQL로 쪽을 자르면 한 쪽이 50개가 아니라 47개가 된다.

**규모가 커지면 바뀌는 판단이다.** 수천 행이 되면 SQL로 옮긴다 — 그 시점의 신호는 이 화면의 응답이 느껴질 만큼 느려지는 것이다.

**Files:**
- Create: `src/lib/wikisource-catalogue.ts`
- Test: `src/lib/wikisource-catalogue.test.ts`

**Interfaces:**
- Consumes: `src/lib/wikisource-meta.ts`의 `SCOPE_GENRES`·`WorkGenre` (Task 1), `src/lib/book-rights.ts`의 `isListable` (Task 2)
- Produces:
  - `PAGE_SIZE = 50`
  - `SORT_KEYS: readonly ["title", "author", "genre", "year"]`, `type SortKey = "title" | "author" | "genre" | "year"`
  - `type WorkRow = { page_title: string; title: string; author: string | null; genre: WorkGenre; pub_year: number | null; translator: string | null }`
  - `type CatalogueQuery = { q: string; genre: WorkGenre | null; decade: number | null; noYear: boolean; sort: SortKey; dir: "asc" | "desc"; page: number; hideRegistered: boolean; showUnlistable: boolean }`
  - `type CatalogueRow = WorkRow & { bookId: string | null; blockedReason: string | null }`
  - `parseCatalogueQuery(sp: Record<string, string | string[] | undefined>): CatalogueQuery`
  - `applyCatalogueQuery(rows: readonly WorkRow[], query: CatalogueQuery, registered: ReadonlyMap<string, string>): { rows: CatalogueRow[]; total: number; pageCount: number; page: number }`
  - `buildCatalogueHref(query: CatalogueQuery, patch: Partial<CatalogueQuery>): string`
  - `nextSortDir(query: CatalogueQuery, key: SortKey): "asc" | "desc"`
  - `decadeOptions(rows: readonly WorkRow[]): { decades: number[]; hasNoYear: boolean }`

- [ ] **Step 1: 실패하는 테스트를 쓴다 — `parseCatalogueQuery`**

`src/lib/wikisource-catalogue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyCatalogueQuery,
  buildCatalogueHref,
  decadeOptions,
  nextSortDir,
  parseCatalogueQuery,
  type CatalogueQuery,
  type WorkRow,
} from "@/lib/wikisource-catalogue";

describe("parseCatalogueQuery", () => {
  it("아무 파라미터도 없으면 기본값 — 제목 오름차, 1쪽", () => {
    expect(parseCatalogueQuery({})).toEqual({
      q: "",
      genre: null,
      decade: null,
      noYear: false,
      sort: "title",
      dir: "asc",
      page: 1,
      hideRegistered: false,
      showUnlistable: false,
    });
  });

  it("검색어의 앞뒤 공백을 떼낸다", () => {
    expect(parseCatalogueQuery({ q: "  운수  " }).q).toBe("운수");
  });

  /**
   * 정렬 키를 화이트리스트로 거르는 것이 이 함수의 핵심이다. 파라미터를
   * 그대로 정렬에 쓰면 없는 컬럼 이름이 들어와 예외가 되고, 뒷날 SQL로
   * 옮길 때는 그대로 주입면이 된다.
   */
  it("모르는 정렬 키는 제목으로 되돌린다", () => {
    expect(parseCatalogueQuery({ sort: "pd_tag" }).sort).toBe("title");
    expect(parseCatalogueQuery({ sort: "; drop table" }).sort).toBe("title");
  });

  it("아는 정렬 키는 그대로 쓴다", () => {
    expect(parseCatalogueQuery({ sort: "author" }).sort).toBe("author");
    expect(parseCatalogueQuery({ sort: "year" }).sort).toBe("year");
    expect(parseCatalogueQuery({ sort: "genre" }).sort).toBe("genre");
  });

  it("모르는 정렬 방향은 오름차로 되돌린다", () => {
    expect(parseCatalogueQuery({ dir: "sideways" }).dir).toBe("asc");
    expect(parseCatalogueQuery({ dir: "desc" }).dir).toBe("desc");
  });

  it("모르는 장르는 필터 없음으로 되돌린다", () => {
    expect(parseCatalogueQuery({ genre: "수필" }).genre).toBeNull();
    expect(parseCatalogueQuery({ genre: "시집" }).genre).toBe("시집");
  });

  it("쪽 번호가 숫자가 아니거나 1보다 작으면 1쪽", () => {
    expect(parseCatalogueQuery({ page: "0" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "-3" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "abc" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "" }).page).toBe(1);
    expect(parseCatalogueQuery({ page: "3" }).page).toBe(3);
  });

  it("연대는 10년 단위 숫자만 받는다", () => {
    expect(parseCatalogueQuery({ decade: "1920" })).toMatchObject({
      decade: 1920,
      noYear: false,
    });
    expect(parseCatalogueQuery({ decade: "1925" }).decade).toBeNull();
    expect(parseCatalogueQuery({ decade: "없음" }).decade).toBeNull();
  });

  it("연대 `none`은 연도 없는 것만 보는 뜻이다", () => {
    expect(parseCatalogueQuery({ decade: "none" })).toMatchObject({
      decade: null,
      noYear: true,
    });
  });

  it("체크박스는 `1`일 때만 켜진다", () => {
    expect(parseCatalogueQuery({ hide: "1" }).hideRegistered).toBe(true);
    expect(parseCatalogueQuery({ hide: "0" }).hideRegistered).toBe(false);
    expect(parseCatalogueQuery({ all: "1" }).showUnlistable).toBe(true);
  });

  /** searchParams는 같은 키가 두 번 오면 배열이 된다. */
  it("배열로 온 값은 무시한다", () => {
    expect(parseCatalogueQuery({ q: ["a", "b"] }).q).toBe("");
    expect(parseCatalogueQuery({ sort: ["author", "title"] }).sort).toBe("title");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm test -- src/lib/wikisource-catalogue.test.ts
```

기대: FAIL — `Failed to resolve import "@/lib/wikisource-catalogue"`

- [ ] **Step 3: `parseCatalogueQuery`를 구현한다**

`src/lib/wikisource-catalogue.ts`:

```ts
/**
 * @file 위키문헌 목록 화면의 질의 계층 — 검색·필터·정렬·페이지 (설계: 2026-09-08).
 *
 * **행을 전부 받아 메모리에서 거른다** (실측 329행). SQL로 밀지 않는 이유:
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

/** 한 쪽에 담는 수. 329개면 7쪽이다. */
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
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm test -- src/lib/wikisource-catalogue.test.ts -t parseCatalogueQuery
```

기대: PASS (11 tests)

- [ ] **Step 5: 실패하는 테스트를 쓴다 — 나머지 전부**

`src/lib/wikisource-catalogue.test.ts` 끝에 덧붙인다:

```ts
/** 실측 데이터의 모양을 따른 표본. 금지 저작자와 번역물을 일부러 섞었다. */
const ROWS: WorkRow[] = [
  { page_title: "운수 좋은 날", title: "운수 좋은 날", author: "현진건", genre: "단편소설", pub_year: 1924, translator: null },
  { page_title: "날개", title: "날개", author: "이상", genre: "단편소설", pub_year: 1936, translator: null },
  { page_title: "태평천하", title: "태평천하", author: "채만식", genre: "장편소설", pub_year: 1938, translator: null },
  { page_title: "진달래꽃 (시집)", title: "진달래꽃", author: "김소월", genre: "시집", pub_year: 1925, translator: null },
  { page_title: "강촌 (두보)", title: "강촌", author: null, genre: "단편소설", pub_year: null, translator: null },
  { page_title: "토지", title: "토지", author: "박경리", genre: "장편소설", pub_year: 1969, translator: null },
  { page_title: "가던 길 멈춰서", title: "가던 길 멈춰서", author: "윌리엄 데이비스", genre: "시집", pub_year: 1911, translator: "pk0001" },
];

/** page_title → books.id. 실제로는 books.source_ref로 짝지어 만든다. */
const REGISTERED = new Map([["운수 좋은 날", "book-1"]]);

const run = (patch: Partial<CatalogueQuery> = {}, rows: WorkRow[] = ROWS) =>
  applyCatalogueQuery(rows, { ...parseCatalogueQuery({}), ...patch }, REGISTERED);

describe("applyCatalogueQuery", () => {
  it("기본은 등록 불가를 가린다 — 금지 저작자와 번역물", () => {
    const titles = run().rows.map((r) => r.title);
    expect(titles).not.toContain("토지");
    expect(titles).not.toContain("가던 길 멈춰서");
    expect(run().total).toBe(5);
  });

  it("저자가 비어 있는 행은 가리지 않는다 — 가져올 때 입력받는다", () => {
    expect(run().rows.map((r) => r.title)).toContain("강촌");
  });

  it("등록 불가 포함해서 보기를 켜면 사유와 함께 나온다", () => {
    const rows = run({ showUnlistable: true }).rows;
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.title === "토지")?.blockedReason).toMatch(/2008년/);
    expect(rows.find((r) => r.title === "가던 길 멈춰서")?.blockedReason).toMatch(/번역/);
    expect(rows.find((r) => r.title === "날개")?.blockedReason).toBeNull();
  });

  it("등록된 작품에 books.id를 붙인다", () => {
    expect(run().rows.find((r) => r.page_title === "운수 좋은 날")?.bookId).toBe("book-1");
    expect(run().rows.find((r) => r.title === "날개")?.bookId).toBeNull();
  });

  it("등록된 것 숨기기", () => {
    expect(run({ hideRegistered: true }).rows.map((r) => r.title)).not.toContain(
      "운수 좋은 날",
    );
    expect(run({ hideRegistered: true }).total).toBe(4);
  });

  it("검색은 작품명과 저자를 모두 본다", () => {
    expect(run({ q: "날개" }).rows.map((r) => r.title)).toEqual(["날개"]);
    expect(run({ q: "현진건" }).rows.map((r) => r.title)).toEqual(["운수 좋은 날"]);
  });

  it("검색은 부분 일치이고 대소문자를 가리지 않는다", () => {
    expect(run({ q: "좋은" }).total).toBe(1);
    expect(run({ q: "WILLIAM" }).total).toBe(0);
  });

  /** 저자가 null인 행에서 검색이 터지면 목록 전체가 죽는다. */
  it("저자가 null인 행에서 검색이 터지지 않는다", () => {
    expect(() => run({ q: "아무거나" })).not.toThrow();
    expect(run({ q: "강촌" }).total).toBe(1);
  });

  it("장르 필터", () => {
    expect(run({ genre: "시집" }).rows.map((r) => r.title)).toEqual(["진달래꽃"]);
    expect(run({ genre: "단편소설" }).total).toBe(3);
  });

  it("연대 필터는 10년 구간이다", () => {
    expect(run({ decade: 1920 }).rows.map((r) => r.title)).toEqual([
      "운수 좋은 날",
      "진달래꽃",
    ]);
    expect(run({ decade: 1930 }).rows.map((r) => r.title)).toEqual([
      "날개",
      "태평천하",
    ]);
  });

  it("연도 없음 필터", () => {
    expect(run({ noYear: true }).rows.map((r) => r.title)).toEqual(["강촌"]);
  });

  it("제목을 한국어 순서로 정렬한다", () => {
    expect(run().rows.map((r) => r.title)).toEqual([
      "강촌",
      "날개",
      "운수 좋은 날",
      "진달래꽃",
      "태평천하",
    ]);
  });

  it("내림차 정렬", () => {
    expect(run({ dir: "desc" }).rows.map((r) => r.title)).toEqual([
      "태평천하",
      "진달래꽃",
      "운수 좋은 날",
      "날개",
      "강촌",
    ]);
  });

  it("연도 정렬", () => {
    expect(run({ sort: "year" }).rows.map((r) => r.pub_year)).toEqual([
      1924, 1925, 1936, 1938, null,
    ]);
  });

  /**
   * 빈 값은 방향과 무관하게 끝으로 보낸다. 내림차로 정렬했더니 `—`가 위에
   * 몰리면 표가 쓸모없어진다.
   */
  it("빈 값은 오름차·내림차 모두 끝으로 보낸다", () => {
    expect(run({ sort: "year", dir: "desc" }).rows.map((r) => r.pub_year)).toEqual([
      1938, 1936, 1925, 1924, null,
    ]);
    expect(run({ sort: "author", dir: "desc" }).rows.at(-1)?.author).toBeNull();
  });

  it("쪽을 자른다", () => {
    const many: WorkRow[] = Array.from({ length: 120 }, (_, i) => ({
      page_title: `문서 ${i}`,
      title: `제목 ${String(i).padStart(3, "0")}`,
      author: "현진건",
      genre: "단편소설" as const,
      pub_year: 1930,
      translator: null,
    }));

    const first = applyCatalogueQuery(many, parseCatalogueQuery({}), REGISTERED);
    expect(first.rows).toHaveLength(50);
    expect(first.total).toBe(120);
    expect(first.pageCount).toBe(3);
    expect(first.rows[0].title).toBe("제목 000");

    const last = applyCatalogueQuery(many, parseCatalogueQuery({ page: "3" }), REGISTERED);
    expect(last.rows).toHaveLength(20);
    expect(last.page).toBe(3);
  });

  /**
   * 7쪽을 보다가 필터를 걸면 결과가 1쪽으로 줄 수 있다. 그때 빈 표를
   * 보여주면 관리자는 "필터에 걸리는 게 없다"로 읽는다 — 실제로는 있다.
   */
  it("쪽 번호가 범위를 넘으면 마지막 쪽으로 당긴다", () => {
    const r = run({ page: 9 });
    expect(r.page).toBe(1);
    expect(r.rows).toHaveLength(5);
  });

  it("결과가 없으면 pageCount는 1이고 rows는 빈 배열", () => {
    const r = run({ q: "없는작품" });
    expect(r.total).toBe(0);
    expect(r.pageCount).toBe(1);
    expect(r.page).toBe(1);
    expect(r.rows).toEqual([]);
  });
});

describe("decadeOptions", () => {
  /** 선택지를 손으로 적으면 데이터와 어긋난다 — 실제 값에서 만든다. */
  it("실제 데이터에 있는 연대만 오름차로 준다", () => {
    expect(decadeOptions(ROWS)).toEqual({
      decades: [1910, 1920, 1930, 1960],
      hasNoYear: true,
    });
  });

  it("연도 없는 행이 없으면 hasNoYear는 false", () => {
    expect(decadeOptions(ROWS.filter((r) => r.pub_year !== null)).hasNoYear).toBe(false);
  });

  it("빈 배열을 견딘다", () => {
    expect(decadeOptions([])).toEqual({ decades: [], hasNoYear: false });
  });
});

describe("nextSortDir", () => {
  it("같은 컬럼을 다시 누르면 방향이 뒤집힌다", () => {
    expect(nextSortDir(parseCatalogueQuery({ sort: "title", dir: "asc" }), "title")).toBe(
      "desc",
    );
  });

  it("다른 컬럼을 누르면 오름차로 시작한다", () => {
    expect(nextSortDir(parseCatalogueQuery({ sort: "title", dir: "desc" }), "author")).toBe(
      "asc",
    );
  });
});

describe("buildCatalogueHref", () => {
  const base = parseCatalogueQuery({});

  it("기본값인 항목은 주소에 넣지 않는다 — 주소가 읽을 수 있게 남는다", () => {
    expect(buildCatalogueHref(base, {})).toBe("/admin/books/wikisource");
  });

  it("바꾼 항목만 담는다", () => {
    const href = buildCatalogueHref(base, { genre: "시집" });
    expect(new URL(href, "http://x").searchParams.get("genre")).toBe("시집");
  });

  /**
   * 7쪽을 보다가 장르를 고르면 결과가 1쪽뿐일 수 있다. 쪽 번호를 물고 가면
   * 빈 표가 뜬다.
   */
  it("필터를 바꾸면 쪽 번호를 1로 되돌린다", () => {
    const onPage7 = parseCatalogueQuery({ page: "7" });
    expect(buildCatalogueHref(onPage7, { genre: "시집" })).not.toContain("page=");
    expect(buildCatalogueHref(onPage7, { q: "날개" })).not.toContain("page=");
    expect(buildCatalogueHref(onPage7, { sort: "author" })).not.toContain("page=");
  });

  it("쪽 번호만 바꿀 때는 나머지 상태를 물고 간다", () => {
    const href = buildCatalogueHref(parseCatalogueQuery({ genre: "시집" }), { page: 3 });
    expect(href).toContain("page=3");
    expect(new URL(href, "http://x").searchParams.get("genre")).toBe("시집");
  });

  it("연도 없음은 decade=none으로 담는다", () => {
    expect(buildCatalogueHref(base, { noYear: true })).toContain("decade=none");
  });

  it("체크박스는 켤 때만 담는다", () => {
    expect(buildCatalogueHref(base, { hideRegistered: true })).toContain("hide=1");
    expect(buildCatalogueHref(base, { hideRegistered: false })).not.toContain("hide=");
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

```bash
npm test -- src/lib/wikisource-catalogue.test.ts
```

기대: FAIL — `applyCatalogueQuery is not a function`

- [ ] **Step 7: 나머지를 구현한다**

`src/lib/wikisource-catalogue.ts` 끝에 덧붙인다:

```ts
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
function compare(
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
 * 후보 행을 걸러 정렬하고 한 쪽을 잘라 준다.
 *
 * @param rows `wikisource_works` 전체 (실측 329행)
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
        // 저자는 null일 수 있다 — 「강촌 (두보)」처럼 다른 틀을 쓰는 문서.
        const haystack = `${row.title} ${row.author ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    })
    .sort((a, b) =>
      compare(sortValue(a, query.sort), sortValue(b, query.sort), query.dir),
    );

  const total = matched.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 7쪽을 보다가 필터를 걸면 결과가 1쪽으로 줄 수 있다. 그때 빈 표를
  // 보여주면 관리자는 "필터에 걸리는 게 없다"로 읽는다 — 실제로는 있다.
  const page = Math.min(query.page, pageCount);
  const from = (page - 1) * PAGE_SIZE;

  return { rows: matched.slice(from, from + PAGE_SIZE), total, pageCount, page };
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
 * **필터가 바뀌면 쪽 번호를 1로 되돌린다.** 7쪽을 보다가 장르를 고르면
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
```

- [ ] **Step 8: 통과를 확인한다**

```bash
npm test -- src/lib/wikisource-catalogue.test.ts
```

기대: PASS (전체)

```bash
npm test
```

기대: 전체 PASS

- [ ] **Step 9: 빌드**

```bash
npm run build
```

기대: 성공

- [ ] **Step 10: 커밋**

```bash
git add src/lib/wikisource-catalogue.ts src/lib/wikisource-catalogue.test.ts
git commit -F- <<'MSG'
feat(wikisource): 목록 화면의 검색·필터·정렬·페이지를 순수 함수로 만든다

329행을 전부 받아 메모리에서 거른다. SQL로 밀지 않은 이유가 넷이다.
sort 파라미터를 .order()에 넣으면 주입면이 되고, 공백·괄호가 든 제목을
.not(…,"in",…)에 넣으려면 인용 규칙과 씨름해야 한다. 이 저장소의 테스트
정책은 순수 함수만이라 SQL로 밀면 이 계층 전체가 테스트 밖으로 나간다.
Intl.Collator("ko")가 Postgres 기본 콜레이션보다 한국어 정렬을 확실히 한다.
그리고 금지 저작자를 SQL로 거르려면 이름 정규화를 SQL에 한 벌 더 만들어야
한다. 수천 행이 되면 다시 판단할 일이다.

표가 쓸모없어지는 두 경우를 테스트로 못박았다. 빈 값이 내림차 정렬에서
위로 몰리는 것과, 7쪽을 보다가 필터를 걸어 결과가 1쪽으로 줄었을 때 빈
표가 뜨는 것이다 — 후자는 관리자가 "걸리는 게 없다"로 오독한다.
MSG
```

---

### Task 5: 동기화 스크립트 (`sync-wikisource-works.mjs`)

위키문헌에서 후보를 받아 `wikisource_works`를 채운다. 이 계획에서 **위키문헌 API를 부르는 유일한 곳**이다.

**레이트 리밋이 이 Task의 설계를 지배한다.** 실측으로 세 번 차단당했다: 50개 묶음 + 120ms 간격에서 즉시, 20개 묶음 + 1초 간격에서 백오프 11회, 20개 묶음 + 2초 간격에서도 걸렸다. 그래서 순차·2초·20개·백오프가 협상 대상이 아니다.

**Files:**
- Create: `scripts/sync-wikisource-works.mjs`
- Modify: `package.json` — `wikisource:sync` 스크립트

**Interfaces:**
- Consumes: `src/lib/wikisource-meta.ts`의 `SCOPE_GENRES`·`parseHeader`·`parseCategories`·`isCandidate` (Task 1), `src/lib/book-rights.ts`의 `normalizeAuthorKey`는 **쓰지 않는다**(표에는 원문 이름을 그대로 담고 판정은 화면이 한다), 표 `public.wikisource_works` (Task 3)
- Produces: 채워진 `wikisource_works` — Task 6의 화면이 읽는다

- [ ] **Step 1: `package.json`에 스크립트를 더한다**

`"epubs:refresh"` 아래에 한 줄:

```json
    "wikisource:sync": "node --env-file=.env scripts/sync-wikisource-works.mjs",
```

- [ ] **Step 2: 스크립트를 쓴다**

`scripts/sync-wikisource-works.mjs`. `scripts/refresh-epubs.mjs`의 관용구를 따른다 — `.mjs`가 `.ts`를 import하는 것은 Node 24 타입 스트리핑으로 이미 동작이 확인된 방식이다(로드되는 파일의 확장자가 기준이다).

```js
/**
 * 위키문헌에서 가져올 수 있는 작품 후보를 받아 wikisource_works를 채운다.
 *
 *   npm run wikisource:sync -- --dry-run   (쓰지 않고 무엇이 바뀔지만 본다)
 *   npm run wikisource:sync                (실제로 쓴다 — 운영 DB가 바뀐다)
 *
 * **이 프로젝트는 개발용 DB가 따로 없다.** 쓰기는 곧 운영을 바꾼다. 그래서
 * --dry-run이 선택이 아니라 전제다: 먼저 돌려 보고, 보고가 납득되면 쓴다.
 *
 * 레이트 리밋이 이 스크립트의 형태를 정했다. 실측으로 세 번 차단당했다 —
 * 50개 묶음 + 120ms에서 즉시, 20개 + 1초에서 백오프 11회, 20개 + 2초에서도
 * 걸렸다. 순차·2초·20개·백오프를 줄이지 말 것. 총 요청 약 47회로 2분쯤
 * 걸리고, 사람이 드물게 돌리는 스크립트라 그 정도는 무해하다.
 *
 * service role 키를 쓰므로 RLS를 우회한다.
 */

import { createClient } from "@supabase/supabase-js";
import {
  SCOPE_GENRES,
  isCandidate,
  parseCategories,
  parseHeader,
} from "../src/lib/wikisource-meta.ts";

const API = "https://ko.wikisource.org/w/api.php";
const USER_AGENT = "ttokttok/0.1 (https://github.com/ttokttok; content sourcing)";

/** 요청 사이 최소 간격. 2초에서도 걸린 적이 있으니 줄이지 말 것. */
const GAP_MS = 2000;

/** 한 요청에 담는 제목 수. 50개는 즉시 차단당했다. */
const BATCH = 20;

/** 제한 응답 백오프: 10 → 20 → 30 → 40 → 50초, 최대 5회. */
const MAX_RETRY = 5;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.\n" +
      "실행: npm run wikisource:sync -- --dry-run",
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * API를 한 번 부른다. 제한에 걸리면 백오프하고 재시도한다.
 *
 * 위키문헌은 제한을 걸 때 JSON이 아닌 본문을 돌려준다("You are making too
 * many requests to the API.") — 그래서 파싱 실패를 제한 신호로 읽는다.
 * 상태 코드만 보면 놓친다.
 */
async function api(params, attempt = 0) {
  const res = await fetch(`${API}?${params}&format=json`, {
    headers: { "User-Agent": USER_AGENT },
  });
  const text = await res.text();

  // 다음 요청 전에 무조건 쉰다. 성공했을 때도 쉬어야 누적 할당량에 걸리지 않는다.
  await sleep(GAP_MS);

  try {
    return JSON.parse(text);
  } catch {
    if (attempt < MAX_RETRY) {
      const wait = 10000 * (attempt + 1);
      console.log(`  ! 제한 — ${wait / 1000}초 대기 후 재시도`);
      await sleep(wait);
      return api(params, attempt + 1);
    }
    throw new Error(`위키문헌 API 응답을 읽을 수 없다: ${text.slice(0, 120)}`);
  }
}

/** 분류의 문서를 모두 나열한다. namespace 0(본문)만, cmcontinue로 이어받는다. */
async function listCategory(category) {
  const titles = [];
  let cont = "";

  do {
    const r = await api(
      `action=query&list=categorymembers&cmnamespace=0&cmlimit=500` +
        `&cmtitle=${encodeURIComponent(`분류:${category}`)}` +
        (cont ? `&cmcontinue=${encodeURIComponent(cont)}` : ""),
    );
    titles.push(...r.query.categorymembers.map((m) => m.title));
    cont = r.continue?.cmcontinue ?? "";
  } while (cont);

  return titles;
}

/**
 * 여러 문서의 속성을 한 번에 받는다.
 *
 * `continue`를 처리하는 이유: 분류가 많은 문서에서 잘리면 장르가 조용히
 * 사라져 그 작품이 목록에서 빠진다. `cllimit=500`이면 20개 묶음에서 거의
 * 안 걸리지만, "거의"에 기대면 언젠가 한 작품이 이유 없이 사라진다.
 */
async function fetchProp(titles, extra) {
  const merged = new Map();
  let cont = null;

  do {
    const contParams = cont
      ? Object.entries(cont)
          .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
          .join("")
      : "";

    const r = await api(
      `action=query&titles=${encodeURIComponent(titles.join("|"))}${extra}${contParams}`,
    );

    for (const page of Object.values(r.query?.pages ?? {})) {
      const prev = merged.get(page.title);
      if (!prev) {
        merged.set(page.title, page);
        continue;
      }
      // 이어받은 응답은 같은 문서의 나머지 분류만 담고 온다 — 이어 붙인다.
      if (page.categories) prev.categories = [...(prev.categories ?? []), ...page.categories];
      if (page.revisions) prev.revisions = page.revisions;
    }

    cont = r.continue ?? null;
  } while (cont);

  return merged;
}

function progress(done, total, label) {
  console.log(`  [${String(done).padStart(3)}/${total}] ${label}`);
}

async function run() {
  console.log(
    dryRun
      ? "· --dry-run — 쓰지 않고 무엇이 바뀔지만 본다.\n"
      : "· 실제로 쓴다. 이 프로젝트는 개발용 DB가 없어 운영이 바뀐다.\n",
  );

  // ---- 1) 장르 분류를 나열해 후보 제목을 모은다 (요청 9회) ----
  console.log(`=== 장르 분류 ${SCOPE_GENRES.length}개를 나열한다 ===`);
  const union = new Set();

  for (const genre of SCOPE_GENRES) {
    const titles = await listCategory(genre);
    titles.forEach((t) => union.add(t));
    console.log(`  ${String(titles.length).padStart(4)}  ${genre}`);
  }

  const allTitles = [...union];
  console.log(`  ────────────────`);
  console.log(`  ${String(allTitles.length).padStart(4)}  중복 제거 합계\n`);

  if (allTitles.length === 0) {
    throw new Error(
      "후보가 하나도 없다. 위키문헌이 분류를 개편했거나 요청이 전부 실패했다 — 표를 건드리지 않고 멈춘다.",
    );
  }

  // ---- 2) 분류와 위키텍스트를 받아 파싱한다 (요청 약 38회) ----
  console.log(`=== 문서별 메타데이터를 받는다 (${BATCH}개씩) ===`);

  const candidates = [];
  // 키는 isCandidate가 돌려주는 사유 문자열 그대로다. 전부 인용해 둔다 —
  // 하나만 따옴표를 빼면 사유 목록이 아니라 뒤섞인 리터럴로 읽힌다.
  const excluded = {
    "범위 밖 장르": 0,
    "하위 문서": 0,
    "친일문학": 0,
    "PD 태그 없음": 0,
  };
  let noAuthor = 0;
  let translated = 0;

  for (let i = 0; i < allTitles.length; i += BATCH) {
    const chunk = allTitles.slice(i, i + BATCH);

    const cats = await fetchProp(chunk, "&prop=categories&cllimit=500");
    const revs = await fetchProp(chunk, "&prop=revisions&rvslots=main&rvprop=content");

    for (const title of chunk) {
      const catNames = (cats.get(title)?.categories ?? []).map((c) => c.title);
      const meta = parseCategories(catNames);

      const verdict = isCandidate(meta);
      if (!verdict.ok) {
        excluded[verdict.reason]++;
        continue;
      }

      const wikitext =
        revs.get(title)?.revisions?.[0]?.slots?.main?.["*"] ?? "";
      const header = parseHeader(wikitext);

      if (!header.author) noAuthor++;
      if (header.translator) translated++;

      candidates.push({
        page_title: title,
        title: header.title ?? title,
        author: header.author,
        genre: meta.genre,
        pub_year: meta.pubYear,
        pd_tag: meta.pdTag,
        translator: header.translator,
        synced_at: new Date().toISOString(),
      });
    }

    progress(Math.min(i + BATCH, allTitles.length), allTitles.length, `후보 ${candidates.length}개`);
  }

  // ---- 3) 보고 ----
  console.log(`\n=== 제외 ===`);
  for (const [reason, n] of Object.entries(excluded)) {
    console.log(`  ${String(n).padStart(4)}  ${reason}`);
  }
  console.log(`  ────────────────`);
  console.log(`  ${String(candidates.length).padStart(4)}  표에 담을 것`);
  console.log(`\n  저자 파싱 실패 ${noAuthor}개 — 목록에 남고 가져올 때 입력받는다`);
  console.log(`  번역물 ${translated}개 — 표에는 담고 목록에서 가린다`);

  // ---- 4) 기존 행과 비교 ----
  const { data: existing, error: readErr } = await db
    .from("wikisource_works")
    .select("page_title");
  if (readErr) throw new Error(`wikisource_works 조회: ${readErr.message}`);

  const had = new Set(existing.map((r) => r.page_title));
  const nextTitles = new Set(candidates.map((c) => c.page_title));
  const added = candidates.filter((c) => !had.has(c.page_title));
  const removed = [...had].filter((t) => !nextTitles.has(t));

  console.log(`\n=== 변경 ===`);
  console.log(`  신규 ${added.length} · 갱신 ${candidates.length - added.length} · 삭제 ${removed.length}`);
  if (added.length) console.log(`  신규 예: ${added.slice(0, 5).map((c) => c.title).join(", ")}`);
  if (removed.length) console.log(`  삭제 예: ${removed.slice(0, 5).join(", ")}`);

  if (dryRun) {
    console.log(`\n· --dry-run이라 아무것도 쓰지 않았다.`);
    return;
  }

  /**
   * 부분 실패로 표를 비우지 않기 위한 관문.
   *
   * 레이트 리밋 때문에 크롤이 중간에 실패한 적이 실제로 여러 번 있다. 그때
   * 후보가 적게 모이는데, 그걸 그대로 반영하면 "위키문헌에서 사라진 문서"로
   * 오인해 표를 대량 삭제한다. 다음 동기화가 되돌리기는 하지만 그 사이의
   * 목록은 텅 비어 있다.
   */
  if (had.size > 0 && candidates.length < had.size * 0.7 && !force) {
    throw new Error(
      `후보가 기존 ${had.size}개의 70% 미만(${candidates.length}개)이다. ` +
        `크롤이 중간에 실패했을 가능성이 높아 멈춘다. ` +
        `의도한 축소라면 --force를 붙인다.`,
    );
  }

  // ---- 5) upsert + 사라진 행 삭제 ----
  const { error: upErr } = await db
    .from("wikisource_works")
    .upsert(candidates, { onConflict: "page_title" });
  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  if (removed.length) {
    const { error: delErr } = await db
      .from("wikisource_works")
      .delete()
      .in("page_title", removed);
    if (delErr) throw new Error(`삭제: ${delErr.message}`);
  }

  console.log(`\n✓ ${candidates.length}개 반영 완료 (삭제 ${removed.length})`);
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
```

- [ ] **Step 3: `.mjs`가 `.ts`를 읽을 수 있는지 먼저 확인한다**

전체를 돌리기 전에 import만 확인한다. 여기서 실패하면 그 원인은 하나다 — `wikisource-meta.ts`에 `server-only`가 들어간 것.

```bash
node -e "import('./src/lib/wikisource-meta.ts').then(m => console.log('✓ import 성공:', Object.keys(m).join(', ')))"
```

기대: `✓ import 성공: SCOPE_GENRES, parseHeader, parseCategories, isCandidate, toBookCategory`

- [ ] **Step 4: `--dry-run`으로 돌린다 — 사용자에게 먼저 알린다**

이 실행은 **위키문헌에 47회 요청을 보내고 2분쯤 걸린다.** DB에는 쓰지 않는다(`wikisource_works` 읽기 한 번만 한다).

사용자에게 알린 뒤 실행한다:

```bash
npm run wikisource:sync -- --dry-run
```

기대 출력 — 설계 문서의 실측치와 대조한다:

```
=== 장르 분류 9개를 나열한다 ===
   186  단편소설      ← 실측치
    51  장편소설
    ...
   365  중복 제거 합계  ← 실측치

=== 제외 ===
     0  범위 밖 장르   ← 장르로 긁었으므로 0이어야 한다
     8  하위 문서      ← 실측치
     2  친일문학       ← 실측치
    26  PD 태그 없음   ← 실측치
   329  표에 담을 것   ← 실측치
```

**숫자가 크게 다르면 멈추고 원인을 찾는다.** 위키문헌이 바뀌었을 수도 있지만, 파싱이 틀렸을 가능성이 먼저다. 특히 `범위 밖 장르`가 0이 아니면 `parseCategories`가 분류 이름을 못 읽고 있다는 뜻이다 — `분류:` 접두사 처리를 확인한다.

`제한 —` 줄이 몇 번 나오는 것은 정상이다. 실측에서도 나왔다.

- [ ] **Step 5: 사용자 동의를 받아 실제로 돌린다**

`--dry-run` 보고가 실측치와 맞으면 사용자에게 알린다:

> `--dry-run` 결과가 설계 문서의 실측치와 맞습니다(365 → 329). 실제로 쓰면 `wikisource_works`에 329행이 들어갑니다. **개발용 DB가 없어 운영 DB가 바뀝니다.** 기존 표·게시물·도서는 건드리지 않습니다. 진행할까요?

동의를 받은 뒤:

```bash
npm run wikisource:sync
```

기대: `✓ 329개 반영 완료 (삭제 0)`

- [ ] **Step 6: 실제로 들어갔는지 확인한다**

```bash
node --env-file=.env scripts/check-table.mjs wikisource_works --sample
```

확인할 것:
- 행 수가 `--dry-run` 보고와 같다
- `author`가 대부분 채워져 있다 (실측 98/99 성공률)
- `page_title`이 정규화된 문서 제목이다 — URL이나 밑줄이 아니다
- `translator`가 채워진 행이 있다면 그 수가 보고와 같다

- [ ] **Step 7: 커밋**

```bash
git add scripts/sync-wikisource-works.mjs package.json
git commit -F- <<'MSG'
feat(wikisource): 작품 후보 동기화 스크립트

장르 분류 9개를 나열해 후보를 모으고, 문서별 분류와 위키텍스트를 받아
wikisource_works를 채운다. 위키문헌 API를 부르는 유일한 곳이다.

레이트 리밋이 형태를 정했다. 실측으로 세 번 차단당해서 순차·2초 간격·
20개 묶음·10~50초 백오프가 협상 대상이 아니다. 총 47회 요청으로 2분쯤
걸리는데, 사람이 드물게 돌리는 스크립트라 그 정도는 무해하다.

--dry-run이 선택이 아니라 전제다. 이 프로젝트는 개발용 DB가 없어 쓰기가
곧 운영을 바꾼다.

부분 실패로 표를 비우지 않는 관문을 뒀다. 크롤이 중간에 끊기면 후보가
적게 모이는데, 그걸 반영하면 "위키문헌에서 사라진 문서"로 오인해 대량
삭제한다. 기존의 70% 미만이면 멈추고, 의도한 축소는 --force로 통과시킨다.

분류 응답의 continue를 처리한다. 잘리면 장르가 조용히 사라져 그 작품이
목록에서 빠진다 — 20개 묶음에서 거의 안 걸리지만 "거의"에 기대면 언젠가
한 작품이 이유 없이 사라진다.
MSG
```

---

### Task 6: 목록 화면과 한 번에 가져오기

표를 그리고, 행의 「가져오기」가 입력 없이 동작하게 한다. 검색·필터·정렬은 Task 7에서 얹는다 — 이 Task가 끝나면 329개가 제목 순으로 7쪽에 걸쳐 보이고 가져오기가 실제로 된다.

**쪽 이동 UI도 이 Task에 포함된다.** 위 목표가 "7쪽에 걸쳐 보이고"라고 말하므로 쪽을 넘길 수단이 없으면 이 Task가 끝나지 않는다. 원래 계획은 Task 7 Step 5에 뒀는데 그건 잘못이었다 — 그 Step은 이제 「확인만」으로 바뀌어 있다.

**「가져오기」는 이미 동작하는 `importFromWikisource`를 재사용한다.** 4MB를 받아 폰트·껍데기를 걷어내고, 빈 껍데기를 검사하고, 중복을 처리하고, 업로드 실패 시 파일을 되돌리는 100줄 남짓의 미묘한 오류 처리가 그 안에 있다. 복사하면 두 벌이 되고, 통째로 꺼내면 동작하는 코드를 흔든다. 숨은 필드로 부르고 **오류 복귀 화면만 갈라 준다**.

**목록에 보인다고 가져와진다는 뜻이 아니다 — 이것은 결함이 아니다.** 목록은 분류와 위키텍스트만 보고 만든 것이고, 본문이 실제로 있는지는 EPUB을 받아 봐야 안다. 「감자」가 그 경우다: 분류상 멀쩡한 단편소설인데 ws-export가 본문 2자만 내준다(기존 실측). 그런 행은 목록에 뜨고, 가져오기를 누르면 `assertClean`의 `MIN_BODY_CHARS` 검사가 잡아 배너로 거절한다.

그래서 **목록에서 걸러도 가져오기 시점의 검사를 없애지 않는다.** 목록은 동기화 시점의 스냅숏이고 게이트는 실제 파일을 본다 — 금지 저작자 검사·중복 검사·`assertClean` 전부 그대로 지난다. Task 6 Step 9에서 어떤 작품이 본문 길이로 거절당하면 그것은 게이트가 일한 것이므로, 고치려 들지 말고 다른 작품으로 확인한다.

**Files:**
- Create: `src/app/admin/(dashboard)/books/wikisource/page.tsx`
- Create: `src/components/admin/import-row-button.tsx`
- Modify: `src/app/admin/(dashboard)/books/import/actions.ts` — `back()`이 복귀 화면을 가르고, 목록 화면을 revalidate한다
- Modify: `src/app/admin/(dashboard)/books/import/page.tsx` — `?source=`·`?category=` 선입력
- Modify: `src/app/admin/(dashboard)/books/page.tsx` — 헤더 버튼을 목록 화면으로

**Interfaces:**
- Consumes: `parseCatalogueQuery`·`applyCatalogueQuery`·`WorkRow`·`CatalogueRow` (Task 4), `toBookCategory` (Task 1), 표 `wikisource_works` (Task 3, 채워짐 — Task 5)
- Produces: 라우트 `/admin/books/wikisource`. Task 7이 이 파일에 필터 UI를 얹는다

- [ ] **Step 1: 임포트 액션이 복귀 화면을 가르게 한다**

`src/app/admin/(dashboard)/books/import/actions.ts`에서 `back()`을 고친다. 기존:

```ts
function back(message: string): never {
  redirect(`/admin/books/import?error=${encodeURIComponent(message)}`);
}
```

바꾼 뒤:

```ts
/**
 * 오류를 안고 온 화면으로 되돌린다.
 *
 * **화살표 함수가 아니라 함수 선언이어야 한다.** 타입스크립트의 제어 흐름
 * 분석은 `never`를 돌려주는 호출 뒤를 도달 불가로 보는데, 그 판단은 호출
 * 대상이 함수 선언(또는 명시적 타입을 가진 const 변수)일 때만 적용된다.
 * `const back = (m: string): never => …` 로 쓰면 아래에서 `source`가
 * `string | null`로 남아 타입 오류가 난다.
 *
 * `from`은 두 값만 뜻이 있고 나머지는 임포트 화면으로 간다. **경로를
 * 폼에서 받지 않는 이유가 이것이다** — 숨은 필드는 사용자가 고칠 수 있고,
 * 받은 경로로 리다이렉트하면 열린 리다이렉트가 된다.
 */
function back(message: string, from: string | null): never {
  const path =
    from === "catalogue" ? "/admin/books/wikisource" : "/admin/books/import";
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}
```

`importFromWikisource` 안에서 `from`을 읽고 모든 `back()` 호출에 넘긴다. 액션 앞부분:

```ts
export async function importFromWikisource(formData: FormData) {
  await requireAdmin();

  const source = str(formData, "source");
  const author = str(formData, "author");
  const category = str(formData, "category");
  // 오류가 났을 때 어느 화면으로 되돌릴지. 값은 back()이 화이트리스트로 거른다.
  const from = str(formData, "from");

  if (!source || !author || !category) {
    back("문서 주소·저자·카테고리는 모두 필요합니다.", from);
  }
```

그리고 **나머지 `back(...)` 호출 7곳 전부**에 `, from`을 더한다. 빠뜨리면 타입 오류로 잡힌다:

```bash
grep -n "back(" "src/app/admin/(dashboard)/books/import/actions.ts"
```

기대: 함수 선언 1줄 + 호출 8줄. 호출은 모두 두 번째 인수로 `from`을 넘긴다.

- [ ] **Step 2: 성공 시 목록 화면도 다시 그리게 한다**

같은 파일 끝부분. 기존:

```ts
  revalidatePath("/admin/books");
  revalidatePath("/");
  redirect(`/admin/books/${bookId}?imported=1`);
```

바꾼 뒤:

```ts
  revalidatePath("/admin/books");
  // 목록의 「✓ 등록됨」 표시가 즉시 반영돼야 한다. 없으면 관리자가 목록으로
  // 돌아왔을 때 방금 가져온 작품이 아직 「가져오기」로 보여 두 번 누른다.
  revalidatePath("/admin/books/wikisource");
  revalidatePath("/");
  redirect(`/admin/books/${bookId}?imported=1`);
```

`?exists=1`로 빠지는 두 경로에도 같은 문제가 있으나 그쪽은 이미 등록된 도서라 목록 표시가 이미 맞다 — 손대지 않는다.

- [ ] **Step 3: 제출 버튼을 클라이언트 컴포넌트로 만든다**

ws-export는 EPUB을 요청 시점에 만든다. 단편은 3초쯤이지만 장편은 수십 초다. 표에 50행이 있으면 어느 행이 일하는 중인지 보이지 않아 관리자가 다시 누르고, 그러면 4MB를 두 번 받아 하나는 unique 인덱스에서 버려진다.

`src/components/admin/import-row-button.tsx`:

```tsx
"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * 목록 행의 「가져오기」 버튼.
 *
 * 클라이언트 컴포넌트인 이유는 `useFormStatus` 하나다. ws-export가 EPUB을
 * 요청 시점에 만들어 장편은 수십 초가 걸리는데, 표에 50행이 있으면 어느
 * 행이 일하는 중인지 보이지 않는다 — 관리자가 다시 누르면 4MB를 두 번
 * 받아 하나는 unique 인덱스에서 버려진다.
 *
 * `useFormStatus`는 폼 **안에** 있어야 상태를 읽는다.
 */
export function ImportRowButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" className="min-h-11" disabled={pending}>
      {pending ? "가져오는 중…" : "가져오기"}
    </Button>
  );
}
```

- [ ] **Step 4: 목록 화면을 만든다**

`src/app/admin/(dashboard)/books/wikisource/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNotice } from "@/components/admin/admin-notice";
import { ImportRowButton } from "@/components/admin/import-row-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import {
  applyCatalogueQuery,
  parseCatalogueQuery,
  type WorkRow,
} from "@/lib/wikisource-catalogue";
import { toBookCategory } from "@/lib/wikisource-meta";
import { importFromWikisource } from "../import/actions";

export const metadata: Metadata = { title: "위키문헌 작품 목록" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

type Row = WorkRow & { synced_at: string };

export default async function WikisourceCataloguePage({
  searchParams,
}: PageProps<"/admin/books/wikisource">) {
  const sp = await searchParams;
  const query = parseCatalogueQuery(sp);
  const db = await createClient();

  // 후보 전체(실측 329행)와 등록된 위키문헌 도서를 함께 받는다. 검색·필터·
  // 정렬·페이지는 wikisource-catalogue.ts의 순수 함수가 처리한다 — 그 파일
  // 머리말에 SQL로 밀지 않은 이유가 있다.
  const [works, books] = await Promise.all([
    db
      .from("wikisource_works")
      .select("page_title, title, author, genre, pub_year, translator, synced_at"),
    db
      .from("books")
      .select("id, source_ref")
      .eq("source", "wikisource")
      .not("source_ref", "is", null),
  ]);

  // 삼키면 실패가 빈 목록이 되어 "후보가 없다"와 구분되지 않는다.
  // 관용구는 books/page.tsx 참고 — 어드민 내부 화면이라 별도 에러 UI 없이
  // 던지고, 메시지는 서버 로그에서 본다.
  if (works.error) throw new Error(works.error.message);
  if (books.error) throw new Error(books.error.message);

  // genre는 DB에서 text다. 이 컬럼을 쓰는 필자는 동기화 스크립트뿐이고 그
  // 스크립트는 SCOPE_GENRES의 값만 넣는다 (표에 있는 근거가 장르라서 not null).
  const rows = (works.data ?? []) as Row[];

  // books.source_ref와 wikisource_works.page_title은 같은 정규화를 거친
  // 형식이다 (src/lib/wikisource.ts의 toPageTitle). 그래서 그냥 짝지어진다.
  const registered = new Map(
    (books.data ?? []).map((b) => [b.source_ref as string, b.id]),
  );

  const result = applyCatalogueQuery(rows, query, registered);

  // 언제 기준의 목록인지 — 목록은 동기화 시점의 스냅숏이다.
  const syncedAt = rows.reduce<string | null>(
    (latest, r) => (!latest || r.synced_at > latest ? r.synced_at : latest),
    null,
  );

  return (
    <div className="flex flex-col gap-6">
      {/*
        375px에서 버튼이 제목 열을 짓누르지 않게 sm 미만은 세로로 쌓고
        min-w-0으로 제목 블록이 실제로 줄어들 수 있게 한다 — books/page.tsx와
        같은 관용구다.
      */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-bold">위키문헌 작품 목록</h1>
          <p className="text-muted-foreground text-sm">
            가져올 수 있는 소설·시집입니다. 저자와 분류가 이미 채워져 있어
            바로 가져올 수 있습니다.
          </p>
        </div>
        <Button asChild variant="outline" className="min-h-11 shrink-0">
          <Link href="/admin/books/import">주소로 직접 가져오기</Link>
        </Button>
      </header>

      <AdminNotice error={q(sp.error)} />

      {/*
        목록에 없는 작품이 있다는 사실을 화면에 적는다. 범위를 소설 계열·
        시집으로 좁혔으므로 「홍염」처럼 위키문헌에 장르가 없는 작품, 수필·
        시 낱편, PD 태그 없는 문서는 여기 없다 — 그걸 모르면 관리자는
        "위키문헌에 없는 작품"으로 오해한다.
      */}
      <p className="text-muted-foreground text-xs">
        총 {result.total.toLocaleString()}편
        {syncedAt && ` · ${new Date(syncedAt).toLocaleDateString("ko-KR")} 기준`}
        {" · 목록에 없는 작품은 "}
        <Link href="/admin/books/import" className="underline">
          주소로 직접
        </Link>
        {" 가져옵니다."}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>작품명</TableHead>
            <TableHead>저자</TableHead>
            <TableHead>장르</TableHead>
            <TableHead>출간</TableHead>
            <TableHead className="text-right">상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.rows.length ? (
            result.rows.map((row) => (
              <TableRow
                key={row.page_title}
                className={row.blockedReason ? "opacity-60" : undefined}
              >
                <TableCell className="font-medium break-keep">
                  {row.title}
                  {/*
                    표시 제목과 문서 제목이 다른 경우가 있다 —
                    「진달래꽃」의 문서는 「진달래꽃 (시집)」이다. 무엇을
                    가져오는지 보이지 않으면 동명 작품을 구별할 수 없다.
                  */}
                  {row.page_title !== row.title && (
                    <span className="text-muted-foreground ml-1 text-xs">
                      ({row.page_title})
                    </span>
                  )}
                </TableCell>
                <TableCell className="break-keep">{row.author ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{row.genre}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.pub_year ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    {row.blockedReason ? (
                      <span className="text-muted-foreground text-xs break-keep">
                        {row.blockedReason}
                      </span>
                    ) : row.bookId ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/books/${row.bookId}`}>✓ 등록됨</Link>
                      </Button>
                    ) : row.author ? (
                      <form action={importFromWikisource}>
                        <input type="hidden" name="source" value={row.page_title} />
                        <input type="hidden" name="author" value={row.author} />
                        <input
                          type="hidden"
                          name="category"
                          value={toBookCategory(row.genre)}
                        />
                        {/* 오류가 나면 임포트 화면이 아니라 이 목록으로 돌아온다. */}
                        <input type="hidden" name="from" value="catalogue" />
                        <ImportRowButton />
                      </form>
                    ) : (
                      /*
                        저자가 없는 행은 숨기지 않는다 (실측 99개 중 1개,
                        「강촌 (두보)」처럼 다른 틀을 쓰는 문서). 가져오기를
                        누르면 임포트 화면으로 보내 저자를 입력받는다.
                      */
                      <Button asChild variant="secondary" size="sm" className="min-h-11">
                        <Link
                          href={`/admin/books/import?source=${encodeURIComponent(
                            row.page_title,
                          )}&category=${encodeURIComponent(toBookCategory(row.genre))}`}
                        >
                          저자 입력 후
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground text-center">
                {rows.length
                  ? "조건에 맞는 작품이 없습니다."
                  : "후보가 없습니다. npm run wikisource:sync 를 먼저 돌립니다."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

**빈 표의 문구를 두 갈래로 나눈 이유:** 표가 비어 있는 것과 필터에 걸리는 게 없는 것은 관리자가 할 일이 다르다. 하나로 합치면 동기화를 안 돌린 상태에서 "필터를 풀어 봐야겠다"고 헤맨다.

- [ ] **Step 5: 임포트 화면이 선입력을 받게 한다**

`src/app/admin/(dashboard)/books/import/page.tsx`의 두 `Input`에 `defaultValue`를 더한다:

```tsx
          <Input
            id="source"
            name="source"
            required
            defaultValue={q(sp.source)}
            placeholder="https://ko.wikisource.org/wiki/운수_좋은_날"
          />
```

```tsx
            <Input
              id="category"
              name="category"
              required
              defaultValue={q(sp.category)}
              placeholder="소설 / 시 / 수필…"
            />
```

`placeholder`는 원래 값을 그대로 둔다. `q()` 헬퍼는 그 파일에 이미 있다.

- [ ] **Step 6: 도서 화면에서 목록으로 가는 길을 만든다**

`src/app/admin/(dashboard)/books/page.tsx`의 헤더 버튼을 바꾼다. 기존:

```tsx
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/books/import">위키문헌에서 가져오기</Link>
          </Button>
```

바꾼 뒤:

```tsx
          {/*
            목록을 먼저 보여주는 쪽이 기본 경로다 — 관리자가 위키문헌을
            따로 뒤지지 않아도 된다. 주소 입력은 목록 화면 안에서 간다.
          */}
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/books/wikisource">위키문헌 목록</Link>
          </Button>
```

- [ ] **Step 7: 빌드와 테스트**

```bash
npm run build
```

기대: 성공. `/admin/books/wikisource`가 라우트 목록에 나온다.

```bash
npm test
```

기대: 전체 PASS

- [ ] **Step 8: 375px에서 실제로 확인한다**

`resize_window`가 이 환경에서 듣지 않는다 — 375×812을 넣어도 `innerWidth`가 그대로 남는다. **같은 출처의 375px iframe으로 확인하고, 어떤 수치를 믿기 전에 `iframeInnerWidth === 375`를 먼저 단정한다.**

개발 서버를 띄우고 `/admin/books/wikisource`를 연다. 확인할 것:

1. 표가 가로로 스크롤된다 (`Table`이 `overflow-x-auto` 래퍼를 이미 갖고 있다)
2. 헤더의 제목 블록이 버튼에 짓눌리지 않는다 — sm 미만에서 세로로 쌓인다
3. 「가져오기」 버튼이 44px 이상이다 (`min-h-11`)
4. 페이지 본문 자체는 가로 스크롤이 없다 — 표만 스크롤된다

- [ ] **Step 9: 실제로 한 편 가져와 본다**

**이 확인은 운영 DB에 도서를 만들고 스토리지에 파일을 올린다.** 사용자에게 먼저 알린다:

> 목록에서 한 편을 실제로 가져와 전체 경로를 확인하려 합니다. 운영 DB에 도서 1건이 생기고 EPUB 1개가 올라갑니다. 확인 뒤 필요 없으면 삭제하겠습니다. 어떤 작품으로 할까요? (짧은 단편이 빠릅니다)

확인할 것:

1. 「가져오기」를 누르면 버튼이 `가져오는 중…`으로 바뀌고 다시 눌리지 않는다
2. 끝나면 도서 수정 화면으로 가고 `imported=1` 토스트가 뜬다
3. 목록으로 돌아오면 그 행이 「✓ 등록됨」으로 바뀌어 있다 (Step 2의 revalidate가 하는 일)
4. 같은 행을 다시 가져오려 하면 기존 도서 수정 화면으로 가고 `exists=1`이 뜬다
5. 「등록된 것 숨기기」는 Task 7에서 확인한다

그리고 **오류 복귀 경로**를 확인한다 — 목록에서 시작한 임포트가 실패하면 목록으로 돌아와야 한다. 가장 쉬운 방법은 존재하지 않는 문서를 가진 행이 없으므로, `?error=테스트`를 직접 열어 배너가 목록 화면에 뜨는지 본다:

```
/admin/books/wikisource?error=%ED%85%8C%EC%8A%A4%ED%8A%B8
```

기대: 표 위에 빨간 배너로 「테스트」가 보인다.

- [ ] **Step 10: 커밋**

```bash
git add "src/app/admin/(dashboard)/books/wikisource/page.tsx" src/components/admin/import-row-button.tsx "src/app/admin/(dashboard)/books/import/actions.ts" "src/app/admin/(dashboard)/books/import/page.tsx" "src/app/admin/(dashboard)/books/page.tsx"
git commit -F- <<'MSG'
feat(admin): 위키문헌 작품 목록에서 골라 가져온다

관리자가 위키문헌 문서 주소를 직접 찾아 붙여넣던 것을, 표에서 골라
누르는 것으로 바꾼다. 저자와 분류가 표에 이미 있으므로 입력이 없다.

가져오기는 이미 동작하는 importFromWikisource를 숨은 필드로 재사용한다.
4MB 수급·껍데기 제거·빈 껍데기 검사·중복 처리·업로드 되돌리기가 그 안에
있어서, 복사하면 두 벌이 되고 통째로 꺼내면 동작하는 코드를 흔든다.
갈라 준 것은 오류 복귀 화면뿐이고, 경로를 폼에서 받지 않고 from 값을
화이트리스트로 거른다 — 받은 경로로 리다이렉트하면 열린 리다이렉트가 된다.

제출 버튼만 클라이언트 컴포넌트로 뒀다. ws-export가 EPUB을 요청 시점에
만들어 장편은 수십 초가 걸리는데, 50행 표에서 어느 행이 일하는 중인지
보이지 않으면 관리자가 다시 누르고 4MB를 두 번 받는다.

빈 표 문구를 두 갈래로 나눴다. 동기화를 안 돌린 것과 필터에 걸리는 게
없는 것은 관리자가 할 일이 다르다.
MSG
```

---

### Task 7: 검색·필터·정렬·페이지 UI

Task 4의 순수 함수를 화면에 붙인다. **클라이언트 컴포넌트를 하나도 더 만들지 않는다** — 검색·필터는 `<form method="get">`, 정렬과 페이지는 `<Link>`다. 상태가 전부 주소에 있으므로(FRONTEND.md §4) 자바스크립트가 할 일이 없다.

`Select`·`Checkbox`(shadcn/Radix)는 클라이언트 컴포넌트라 쓰지 않는다. 네이티브 `<select>`·`<input type="checkbox">`가 폼 제출로 그대로 동작하고, 이 화면은 어드민 내부 표라 브랜드 UI가 필요한 자리가 아니다.

**Files:**
- Modify: `src/app/admin/(dashboard)/books/wikisource/page.tsx`

**Interfaces:**
- Consumes: `buildCatalogueHref`·`nextSortDir`·`decadeOptions`·`SORT_KEYS`·`SortKey`·`PAGE_SIZE` (Task 4), `SCOPE_GENRES` (Task 1)
- Produces: 없음 (마지막 화면 작업)

- [ ] **Step 1: import를 늘린다**

`src/app/admin/(dashboard)/books/wikisource/page.tsx`의 두 import를 고친다:

```tsx
import {
  applyCatalogueQuery,
  buildCatalogueHref,
  decadeOptions,
  nextSortDir,
  parseCatalogueQuery,
  type CatalogueQuery,
  type SortKey,
  type WorkRow,
} from "@/lib/wikisource-catalogue";
import { SCOPE_GENRES, toBookCategory } from "@/lib/wikisource-meta";
```

- [ ] **Step 2: 정렬 가능한 헤더 셀을 만든다**

같은 파일에서, `export default` **위에** 둔다. 이 파일 안의 지역 컴포넌트로 두는 이유: 이 표 하나에서만 쓰이고 `query`에 묶여 있다. 컴포넌트 파일로 빼면 `CatalogueQuery`를 인수로 넘기는 껍데기만 늘어난다.

```tsx
/**
 * 정렬 가능한 컬럼 머리.
 *
 * 현재 정렬 중인 컬럼에만 방향 화살표를 붙인다. 모든 컬럼에 붙이면
 * 무엇이 적용된 정렬인지 안 보인다.
 */
function SortableHead({
  label,
  sortKey,
  query,
  className,
}: {
  label: string;
  sortKey: SortKey;
  query: CatalogueQuery;
  className?: string;
}) {
  const active = query.sort === sortKey;
  const arrow = active ? (query.dir === "asc" ? " ↑" : " ↓") : "";

  return (
    <TableHead className={className}>
      <Link
        href={buildCatalogueHref(query, {
          sort: sortKey,
          dir: nextSortDir(query, sortKey),
        })}
        className="hover:text-foreground inline-flex items-center whitespace-nowrap underline-offset-4 hover:underline"
        aria-label={`${label} 기준으로 ${
          nextSortDir(query, sortKey) === "asc" ? "오름차" : "내림차"
        } 정렬`}
      >
        {label}
        {arrow}
      </Link>
    </TableHead>
  );
}
```

- [ ] **Step 3: 필터 막대를 얹는다**

`AdminNotice` 아래, 총 편수 문단 **위에** 넣는다. `decadeOptions`는 **필터 전 전체 행**으로 만든다 — 필터를 걸면 선택지가 사라져 되돌릴 수 없게 되는 것을 막는다.

컴포넌트 본문에 한 줄 추가 (`result` 계산 뒤):

```tsx
  const { decades, hasNoYear } = decadeOptions(rows);
```

그리고 마크업:

```tsx
      {/*
        method="get"이라 제출하면 값이 그대로 주소가 된다 — 상태가 주소에
        있으므로(FRONTEND.md §4) 클라이언트 컴포넌트가 필요 없다.

        정렬은 이 폼에 없고 헤더 링크가 담당한다. 그래서 숨은 필드로 물고
        가야 한다 — 없으면 검색할 때마다 정렬이 기본값으로 돌아간다.
        쪽 번호는 일부러 넣지 않는다: 필터가 바뀌면 1쪽에서 다시 봐야 한다.
      */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        {query.sort !== "title" && (
          <input type="hidden" name="sort" value={query.sort} />
        )}
        {query.dir !== "asc" && <input type="hidden" name="dir" value={query.dir} />}

        <div className="flex min-w-0 flex-1 basis-full flex-col gap-1 sm:basis-48">
          <Label htmlFor="q" className="text-xs">
            검색
          </Label>
          <Input
            id="q"
            name="q"
            defaultValue={query.q}
            placeholder="작품명 또는 저자"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="genre" className="text-xs">
            장르
          </Label>
          <select
            id="genre"
            name="genre"
            defaultValue={query.genre ?? ""}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">전체</option>
            {SCOPE_GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="decade" className="text-xs">
            출간
          </Label>
          <select
            id="decade"
            name="decade"
            defaultValue={query.noYear ? "none" : (query.decade?.toString() ?? "")}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="">전체</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}년대
              </option>
            ))}
            {hasNoYear && <option value="none">연도 없음</option>}
          </select>
        </div>

        <Button type="submit" variant="secondary" className="min-h-11">
          적용
        </Button>

        {/*
          체크박스는 자바스크립트 없이 켜면 value가 실려 나가고 끄면 아예
          안 실린다 — parseCatalogueQuery가 `1`일 때만 켜진 것으로 읽는
          이유가 이것이다.
        */}
        <div className="flex basis-full flex-col gap-2 sm:basis-auto">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="hide"
              value="1"
              defaultChecked={query.hideRegistered}
              className="size-4"
            />
            등록된 것 숨기기
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all"
              value="1"
              defaultChecked={query.showUnlistable}
              className="size-4"
            />
            등록 불가 포함해서 보기
          </label>
        </div>

        {/*
          필터가 걸려 있을 때만 초기화를 보여준다. 항상 있으면 누를 이유가
          없는 버튼이 자리만 차지한다.
        */}
        {(query.q ||
          query.genre ||
          query.decade !== null ||
          query.noYear ||
          query.hideRegistered ||
          query.showUnlistable) && (
          <Button asChild variant="ghost" className="min-h-11">
            <Link href="/admin/books/wikisource">초기화</Link>
          </Button>
        )}
      </form>
```

`Label`·`Input`을 import에 더한다:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
```

- [ ] **Step 4: 표 머리를 정렬 가능하게 바꾼다**

기존 `<TableHeader>` 블록을 바꾼다:

```tsx
        <TableHeader>
          <TableRow>
            <SortableHead label="작품명" sortKey="title" query={query} />
            <SortableHead label="저자" sortKey="author" query={query} />
            <SortableHead label="장르" sortKey="genre" query={query} />
            <SortableHead label="출간" sortKey="year" query={query} />
            <TableHead className="text-right">상태</TableHead>
          </TableRow>
        </TableHeader>
```

「상태」는 정렬하지 않는다 — 등록 여부는 「등록된 것 숨기기」로 다루고, 정렬까지 두면 같은 일을 하는 조작이 둘이 된다.

- [x] **Step 5: 쪽 이동을 붙인다 — Task 6에서 이미 만들었다. 넣지 말고 확인만 한다**

**이 Step은 계획의 잘못이었다.** Task 6의 목표 문장이 "329개가 제목 순으로 **7쪽에 걸쳐** 보이고"라고 적어 놓고 쪽 이동 UI는 Task 7에 뒀다 — Task 6을 그 목표대로 끝내려면 쪽 이동이 있어야 하므로 서로 어긋난다. Task 6 구현자가 그걸 알아채고 먼저 만들었고, 검토자가 Task 7 Step 5와 거의 같은 코드라는 것을 확인했다.

그래서 **아래 코드를 새로 넣으면 쪽 이동 블록이 두 개가 된다.** 대신 `src/app/admin/(dashboard)/books/wikisource/page.tsx`에 이미 있는 것이 아래 요구를 만족하는지 **확인만** 한다:

- `result.pageCount > 1`일 때만 보인다
- 이전/다음만 있고 쪽 번호 목록은 없다
- 비활성 쪽은 `asChild` 없는 순수 `<Button disabled>`다 (`asChild`로 넘기면 `disabled`가 `<a>`에 실려 유효하지 않은 속성이 된다)
- `query.page`가 아니라 **`result.page`**를 쓴다 — `query.page`는 범위를 넘을 수 있고 `applyCatalogueQuery`가 당겨 놓은 값이 실제로 보고 있는 쪽이다
- 버튼이 `min-h-11`이다

확인 명령:

```bash
grep -n "pageCount\|result.page\|disabled" "src/app/admin/(dashboard)/books/wikisource/page.tsx"
```

아래는 원래 계획했던 코드다. **참고용으로만 남긴다 — 붙여 넣지 않는다.**

```tsx
      {result.pageCount > 1 && (
        <nav
          aria-label="쪽 이동"
          className="flex items-center justify-between gap-2"
        >
          {/*
            앞뒤 두 개만 둔다. 7쪽에 번호를 다 늘어놓으면 375px에서 줄이
            넘치고, 관리자는 특정 쪽 번호를 기억해 찾아가지 않는다.
            result.page를 쓴다 — query.page는 범위를 넘을 수 있고
            applyCatalogueQuery가 당겨 놓은 값이 실제로 보고 있는 쪽이다.

            `asChild`와 `disabled`를 함께 조건부로 쓰지 않는다. asChild면
            Button은 Slot이 되어 받은 prop을 자식에게 그대로 넘기는데,
            `disabled`를 `<span>`에 넘기면 유효하지 않은 속성이 되어 React가
            경고한다. 링크 버튼과 비활성 버튼을 아예 나눠 그린다.
          */}
          {result.page > 1 ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={buildCatalogueHref(query, { page: result.page - 1 })}>
                이전
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="min-h-11" disabled>
              이전
            </Button>
          )}

          <span className="text-muted-foreground text-sm">
            {result.page} / {result.pageCount}
          </span>

          {result.page < result.pageCount ? (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={buildCatalogueHref(query, { page: result.page + 1 })}>
                다음
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="min-h-11" disabled>
              다음
            </Button>
          )}
        </nav>
      )}
```

- [ ] **Step 6: 빌드와 테스트**

```bash
npm run build
```

기대: 성공

```bash
npm test
```

기대: 전체 PASS

- [ ] **Step 7: 실제로 조작해 본다**

개발 서버에서 `/admin/books/wikisource`를 열고, 조작마다 **주소가 바뀌는지**를 함께 본다 — 주소에 상태가 없으면 새로고침이나 뒤로가기가 어긋난다.

| 조작 | 기대 주소 | 기대 결과 |
|---|---|---|
| 「시집」 고르고 적용 | `?genre=시집` | 50편 남짓, 장르 칸이 전부 시집 |
| 검색 「김」 + 적용 | `?q=김` | 작품명·저자에 「김」이 든 것만 |
| 「작품명」 머리 클릭 | `?sort=title&dir=desc`… 아니라 `?dir=desc` | 제목 역순, 머리에 ↓ |
| 「출간」 머리 클릭 | `?sort=year` | 연도 오름차, **빈 값이 맨 아래** |
| 다시 클릭 | `?sort=year&dir=desc` | 연도 내림차, **빈 값이 여전히 맨 아래** |
| 「다음」 | `?page=2` | 2/7, 다른 작품들 |
| 7쪽에서 「시집」 적용 | `?genre=시집` (page 없음) | **빈 표가 아니라 1쪽** |
| 「등록된 것 숨기기」 | `?hide=1` | 이미 등록한 도서가 사라짐 |
| 「등록 불가 포함해서 보기」 | `?all=1` | 흐린 행이 사유와 함께 나타남 |
| 「초기화」 | `/admin/books/wikisource` | 전체 목록, 필터 막대 초기 상태 |
| 주소에 `?sort=pd_tag` 직접 입력 | 그대로 | **오류 없이** 제목 정렬로 보인다 |

`?sort=title&dir=desc`가 아니라 `?dir=desc`가 되는 것은 `buildCatalogueHref`가 기본값을 주소에서 빼기 때문이다 — 의도한 동작이다.

- [ ] **Step 8: 375px에서 필터 막대를 확인한다**

`resize_window`가 이 환경에서 듣지 않는다. 같은 출처의 375px iframe으로 확인하고, **수치를 믿기 전에 `iframeInnerWidth === 375`를 먼저 단정한다.**

확인할 것:

1. 검색 입력이 한 줄을 차지하고(`basis-full`), 장르·출간 셀렉트가 그 아래 나란히 선다
2. 체크박스 두 개가 세로로 쌓이고 각각 44px 이상이다
3. 페이지 본문에 가로 스크롤이 없다 — 표만 스크롤된다
4. 「적용」·「초기화」가 줄을 넘겨도 겹치지 않는다

- [ ] **Step 9: 커밋**

```bash
git add "src/app/admin/(dashboard)/books/wikisource/page.tsx"
git commit -F- <<'MSG'
feat(admin): 위키문헌 목록에 검색·필터·정렬·페이지를 붙인다

클라이언트 컴포넌트를 더 만들지 않았다. 검색·필터는 form method="get",
정렬과 페이지는 Link다 — 상태가 전부 주소에 있으니(FRONTEND.md §4)
자바스크립트가 할 일이 없다. shadcn Select·Checkbox는 클라이언트
컴포넌트라 네이티브 요소를 썼고, 어드민 내부 표라 브랜드 UI가 필요한
자리가 아니다.

정렬 상태를 폼의 숨은 필드로 물고 간다. 없으면 검색할 때마다 정렬이
기본값으로 돌아간다. 쪽 번호는 일부러 물고 가지 않는다 — 7쪽을 보다가
필터를 걸면 결과가 1쪽뿐일 수 있고, 그때 빈 표가 뜨면 관리자는 "걸리는
게 없다"로 오독한다.

연대 선택지는 필터를 걸기 전 전체 행에서 만든다. 필터 후 데이터로 만들면
한 번 고른 뒤 선택지가 사라져 되돌릴 수 없다.

쪽 표시는 applyCatalogueQuery가 당겨 놓은 result.page를 쓴다 —
query.page는 범위를 넘을 수 있고 그 값은 실제로 보고 있는 쪽이 아니다.
MSG
```

---

### Task 8: 문서 갱신

규칙·스키마를 바꿨으면 같은 커밋에서 가이드 문서를 갱신한다(AGENTS.md 완료 기준). 이 Task는 코드 변경이 없고 문서만 만진다.

**Files:**
- Modify: `docs/prd-ttokttok.md` — §5.10 갱신 + 결정 기록 §11-61

**Interfaces:**
- Consumes: 앞의 모든 Task의 결과
- Produces: 없음

- [ ] **Step 1: 결정 기록 번호를 확인한다**

```bash
grep -o "^| [0-9]\+ |" docs/prd-ttokttok.md | tr -d '| ' | sort -n | tail -1
```

기대: `60`. 다르면(다른 세션이 항목을 추가했으면) 그다음 번호를 쓴다. **번호를 추측하지 않는다** — 앞선 작업에서 세 번 충돌했다.

- [ ] **Step 2: §5.10에 목록 화면을 적는다**

`docs/prd-ttokttok.md`의 §5.10(위키문헌 수급)에서, 주소를 직접 넣는 것만 적혀 있는 부분을 찾는다:

```bash
grep -n "5.10\|위키문헌" docs/prd-ttokttok.md | head -20
```

그 절에 다음을 더한다. 이미 있는 문장을 지우지 않는다 — 주소 입력 경로는 남아 있다:

```markdown
**작품 목록에서 고르기** (`/admin/books/wikisource`): 가져올 수 있는 작품이 표로 먼저 보이고, 행의 「가져오기」를 누르면 저자·분류 입력 없이 등록된다. 표에는 작품명·저자·장르·출간 연도가 있고 검색·필터·정렬·페이지가 된다.

목록의 범위는 **소설 계열과 시집**이다(실측 329편). 위키문헌 분류를 긁어 모으고 다음을 제외한다: 장으로 쪼개진 문서(`하위 문서` — 상위 문서를 지정해야 ws-export가 장을 따라간다), 친일문학, 저작권 만료 태그(`PD-old-*`)가 없는 문서. 금지 저작자의 작품과 번역물은 표에는 남기고 목록에서만 가린다 — 지우면 "왜 이 작품이 목록에 없나"에 답할 수 없다.

후보는 `wikisource_works` 표에 담고 화면은 우리 DB만 읽는다. `npm run wikisource:sync -- --dry-run`으로 확인한 뒤 `npm run wikisource:sync`로 갱신한다. 위키문헌 레이트 리밋이 세서(2초 간격에서도 걸린다) 화면이 API를 직접 부를 수 없다.

**목록에 없는 작품은 주소 입력 화면(`/admin/books/import`)으로 가져온다** — 위키문헌에 장르 분류가 없는 작품(「홍염」), 수필·시 낱편, PD 태그 없는 문서가 그렇다.
```

- [ ] **Step 3: 결정 기록 §11-61을 더한다**

§11 표의 마지막 행 아래에 한 줄로 더한다. 기존 행들의 형식(`| 번호 | 제목 | 내용 |`)을 그대로 따른다:

```markdown
| 61 | 위키문헌 목록의 뼈대와 범위 | 후보를 모으는 뼈대로 **장르 분류를 긁고 저작권 태그는 조건으로 쓴다**. 판단이 두 번 뒤집혔다 — ① 처음 장르를 뼈대로 잡았으나 이미 등록된 16권 커버리지가 15/16이었다(「홍염」의 분류는 `1927년 작품 / PD-old-70 / 연도 미입력 작품`뿐으로 장르가 없다) ② 그래서 저작권 태그(`PD-old-*`)로 바꿔 16/16을 얻었으나 후보가 2,350개가 됐다 ③ 범위를 **소설 계열과 시집으로 좁히기로 결정**되면서(사용자, 2026-09-08) 어차피 장르로 걸러내므로 PD 뼈대는 2,350개를 긁어 대부분 버리는 낭비가 됐다. 최종: 장르 9종을 긁어 365개, 제외 규칙 적용 후 **329개**(하위 문서 8 · 친일문학 2 · PD 태그 없음 26). 「홍염」이 빠지는 것은 범위를 좁힌 대가이고 주소 입력 화면이 그 경로다. **`PD-old-*`는 위키문헌의 판단이고 우리 기준(§5.11, 1962년 이전 사망)과 다르다** — 태그는 후보를 모으는 그물일 뿐 등록 허가가 아니며, 등록 금지 목록은 태그와 무관하게 따로 있다(`src/lib/book-rights.ts`). 후보를 우리 표(`wikisource_works`)에 담는 이유는 레이트 리밋이다: 후보를 모으는 데 요청 47회가 필요하고 2초 간격에서도 차단당했다(실측 3회). 검색·필터·정렬은 329행을 전부 받아 순수 함수로 처리한다 — SQL로 밀면 `sort` 파라미터가 주입면이 되고, 이 저장소의 테스트 정책(순수 함수만)에서 그 계층이 테스트 밖으로 나가며, 금지 저작자 이름 정규화(NFC·폭 없는 문자)를 SQL에 한 벌 더 만들어야 한다. 수천 행이 되면 다시 판단한다. 설계 근거 전문은 `docs/superpowers/specs/2026-09-08-wikisource-catalogue-design.md` |
```

- [ ] **Step 4: 문서가 코드와 어긋나지 않는지 대조한다**

문서에 적은 값이 실제 코드·DB와 같은지 본다. 어긋난 문서는 없는 문서보다 나쁘다.

```bash
echo "=== 문서에 적은 라우트가 실제로 있나 ==="
ls "src/app/admin/(dashboard)/books/wikisource/page.tsx"
echo "=== 문서에 적은 npm 스크립트가 실제로 있나 ==="
grep -n "wikisource:sync" package.json
echo "=== 문서에 적은 장르 수가 코드와 같나 (9개) ==="
grep -c '"' src/lib/wikisource-meta.ts > /dev/null; node -e "import('./src/lib/wikisource-meta.ts').then(m => console.log('SCOPE_GENRES', m.SCOPE_GENRES.length, '개:', m.SCOPE_GENRES.join(', ')))"
echo "=== 문서에 적은 행 수가 DB와 같나 (329) ==="
node --env-file=.env scripts/check-table.mjs wikisource_works
```

숫자가 다르면 **문서를 실제 값으로 고친다.** 위키문헌이 바뀌어 329가 아닐 수 있다 — 그때는 실제 값을 적고, 언제 기준인지 함께 적는다.

- [ ] **Step 5: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -F- <<'MSG'
docs(prd): 위키문헌 작품 목록을 §5.10과 결정 기록에 적는다

목록 화면의 범위와 제외 규칙, 후보를 우리 표에 담는 이유를 적었다.
결정 기록 §11-61에는 뼈대 판단이 두 번 뒤집힌 경위를 남겼다 — 장르 →
저작권 태그 → 다시 장르. 같은 길을 되짚지 않게 하려는 것이다.

PD-old-* 태그가 우리 기준이 아니라는 점을 두 곳에 적었다. 위키문헌에
문서가 있다는 사실이 "공개해도 된다"로 오독되는 지점이 거기다.
MSG
```

---

## 실행 순서와 의존

```
Task 1 (wikisource-meta)  ─┬─→ Task 4 (catalogue) ─→ Task 6 (화면) ─→ Task 7 (필터 UI) ─→ Task 8 (문서)
Task 2 (book-rights)      ─┘                            ↑
Task 3 (마이그레이션) ──→ Task 5 (동기화 스크립트) ──────┘
```

- **Task 1·2·3은 서로 독립**이라 순서를 바꿔도 된다.
- **Task 4는 1·2가 끝나야** 한다 (둘을 import한다).
- **Task 5는 1·3이 끝나야** 한다 (파싱 함수와 표가 필요하다).
- **Task 6은 3·4가 끝나야** 하고, 화면에 무언가 보이려면 **5까지 돌려 표가 채워져 있어야** 한다.
- Task 3과 5는 **사용자의 동의가 필요한 지점**이다(마이그레이션 적용, 운영 DB 쓰기). 그 앞에서 멈춘다.

## 사람의 손이 필요한 지점 — 미리 알린다

| 시점 | 무엇 | 왜 |
|---|---|---|
| Task 3 Step 5 | 마이그레이션을 대시보드에서 적용 | `db push`는 다른 세션의 마이그레이션을 함께 밀어버린다 |
| Task 5 Step 4 | `--dry-run` 실행 통보 | 위키문헌에 47회 요청, 2분 소요 |
| Task 5 Step 5 | 실제 동기화 동의 | 개발용 DB가 없어 운영 DB에 329행이 들어간다 |
| Task 6 Step 9 | 실제 임포트 1건 동의 | 운영 DB에 도서 1건 + EPUB 1개가 생긴다 |

## 이 계획이 기대는 실측치

작업 중 아래 값이 크게 다르면 **위키문헌이 바뀐 것이 아니라 우리 파싱이 틀렸을 가능성을 먼저 본다.**

| 값 | 실측 (2026-09-08) | 어디서 확인 |
|---|---|---|
| 장르 9종 합계 (중복 제거) | 365 | Task 5 Step 4 |
| 하위 문서 제외 | 8 | Task 5 Step 4 |
| 친일문학 제외 | 2 | Task 5 Step 4 |
| PD 태그 없음 제외 | 26 | Task 5 Step 4 |
| 목록에 남는 것 | **329** | Task 5 Step 4·6 |
| 저자 추출 성공률 | 98/99 | Task 5 Step 6 |
| 기존 도서 커버리지 | 15/16 (「홍염」 누락) | 설계 문서 |
| `books.category` 분포 | 소설 12 · 시 4 | 설계 문서 |

## 이 계획에서 가장 중요한 교훈

**단위 테스트 통과 ≠ 동작한다.** 앞선 위키문헌 작업에서 `wikisource.ts`의 결함 세 개가 **93개 통과 테스트를 뚫고** 살아남았고, 실제 EPUB을 한 번 돌려 보고서야 드러났다. 단순화한 픽스처는 실제 파싱 오류 세 개를 하나도 잡지 못했다.

그래서 이 계획은 순수 함수마다 테스트를 두면서도, **Task 5 Step 4·6과 Task 6 Step 9에 실제 데이터로 확인하는 단계를 못박았다.** 그 단계를 건너뛰지 않는다.
