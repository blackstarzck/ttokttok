# 위키문헌 EPUB 어드민 임포트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 `/admin/books/import`에서 위키문헌 문서 주소(또는 제목)·저자·카테고리만 넣으면, EPUB을 받아 폰트·위키문헌 껍데기를 걷어내고 `epubs` 버킷에 올린 뒤 `books` 행을 만들어 수정 화면으로 보낸다.

**Architecture:** 수급 로직(`scripts/lib/wikisource.mjs`)을 `src/lib/wikisource.ts`로 승격해 앱 런타임·시드 스크립트·재수급 스크립트가 **한 원천**을 공유한다. 임포트는 서버 액션 하나로 동기 처리하고, 스토리지 쓰기만 service role, `books` INSERT는 RLS 클라이언트로 한다 (기존 `saveBook`과 동일한 규약). 어느 위키문헌 문서에서 왔는지를 새 컬럼 `books.source_ref`에 정규화한 문서 제목으로 남겨 중복 임포트를 막고, 재수급 스크립트의 하드코딩 대응표를 없앤다.

**Tech Stack:** Next.js 16 App Router (서버 액션) · Supabase (Postgres + Storage) · fflate (EPUB zip 조작) · Vitest (순수 함수 단위 테스트) · Node v24 (타입 스트리핑으로 `.ts` 스크립트 직접 실행)

## Global Constraints

- **완료 기준**: `npm run build` 통과(타입체크 포함) + `npm test` 통과. 화면 작업은 375px 뷰포트 실제 렌더 확인 (AGENTS.md, FRONTEND.md §7).
- **스타일**: 시맨틱 토큰만 (`bg-background`, `text-muted-foreground`). 원시 hex·px·Tailwind 팔레트 직접 참조 금지 (DESIGN.md).
- **컴포넌트**: 서버 컴포넌트가 기본. `"use client"`는 상태·이벤트가 필요한 leaf에만 (FRONTEND.md §2).
- **데이터 접근**: `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용, 용도는 EPUB signed URL 발급과 어드민 API뿐. 보안은 RLS가 담당 (FRONTEND.md §5).
- **테스트 범위**: 순수 함수만. Supabase 쿼리 빌더를 모킹한 테스트는 만들지 않는다 — 모킹한 모양을 검증할 뿐이다 (`vitest.config.ts` 주석에 명시된 이 저장소의 정책).
- **`"use server"` 파일의 제약**: `"use server"` 지시어가 붙은 파일의 **모든 export는 서버 액션이 된다**. 헬퍼 함수를 그 파일에서 export할 수 없다 — 반드시 별도 모듈에 둔다.
- **`redirect()`는 예외를 throw한다**: Next의 `redirect()`는 특수 예외를 던져 동작한다. `try` 블록 안에서 호출하면 그 `catch`가 리다이렉트를 삼킨다. 던질 수 있는 호출만 좁게 감싸고, `redirect()`는 항상 `try` **밖에서** 호출한다.
- **UI 문구는 한국어.** 오류 문구는 관리자가 **행동할 수 있는** 문장이어야 한다 (PRD §5.10).
- **어드민 알림 규약**: 성공·안내는 `AdminToast`(3초 토스트 + 주소 쿼리 삭제), 오류는 `AdminNotice`(배너로 남김) — PRD §5.10, 결정 기록 §11-39.
- **`source_ref` 형식**: 정규화한 위키문헌 문서 제목. 퍼센트 디코드하고 `_`를 공백으로 바꾼 값. 예: `운수 좋은 날`, `진달래꽃 (시집)`. **URL이 아니다.** 임포트·시드·재수급이 모두 같은 함수(`toPageTitle`)를 거쳐야 unique 인덱스가 중복을 잡는다.
- **언어 고정**: ws-export 호출은 `lang=ko` 고정. 다국어는 MVP 비목표.
- **⚠️ 개발용 Supabase가 따로 없다.** 로컬 `.env`, `next dev`, 운영 Vercel이 **같은 인스턴스**(`jrabwetgciulczhnoxxi`)를 가리킨다. 그래서 마이그레이션·`npm run seed`·`epubs:refresh`·임포트 시험은 **실행하는 즉시 운영 데이터를 바꾼다.** 결과: ① DB나 스토리지를 바꾸는 명령은 실행 전에 컨트롤러의 승인을 받는다 — 임의로 돌리지 않는다. ② `npm run seed`는 시드 게시물의 `like_count`·`view_count`를 하드코딩 값으로 **되돌리므로** 이 계획의 어느 스텝에서도 실행하지 않는다(본문 갱신은 `epubs:refresh`가 한다). ③ 시험용으로 만든 데이터는 반드시 지운다 — 행과 스토리지 파일을 함께.
- **번호는 실행 시점에 다시 확인한다.** master가 활발히 움직여 마이그레이션 번호와 §11 결정 기록 번호가 계획 작성 이후 이미 두 번 밀렸다. 계획에 적힌 값은 **2026-09-04 기준 확인값**이고, 해당 태스크가 재확인 명령을 함께 지시한다. 값이 다르면 계획이 아니라 실측을 따르고 컨트롤러에게 보고한다.

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `src/lib/wikisource.ts` | 수급 로직의 유일한 원천. ws-export 호출, EPUB 정리(`stripEpub`), 문서 제목 정규화(`toPageTitle`), EPUB 메타 읽기(`readEpubMetadata`), 업로드 직전 관문(`assertClean`). 앱·스크립트가 공유한다. |
| `src/lib/wikisource.test.ts` | 위 순수 함수들의 단위 테스트. 픽스처는 바이너리를 커밋하지 않고 `zipSync`로 조립한다. |
| `src/lib/admin-storage.ts` | 실패한 저장의 업로드 되돌리기(`removeUploaded`). `saveBook`과 임포트 액션이 공유. |
| `src/app/admin/(dashboard)/books/import/page.tsx` | 임포트 폼 화면 (서버 컴포넌트). |
| `src/app/admin/(dashboard)/books/import/actions.ts` | `importFromWikisource` 서버 액션. |
| `supabase/migrations/20260903000004_book_source_ref.sql` | `books.source_ref` 컬럼 + 백필 + 부분 unique 인덱스. |
| `scripts/seed.ts` | `scripts/seed.mjs`를 대체. `../src/lib/wikisource.ts`를 import하고 `source_ref`를 쓴다. |
| `scripts/refresh-epubs.ts` | `scripts/refresh-epubs.mjs`를 대체. `PAGE_OVERRIDES` 삭제, `books.source_ref` 사용, `assertClean`을 공유 모듈에서 가져온다. |

**삭제**

- `scripts/lib/wikisource.mjs` → `src/lib/wikisource.ts`로 이전
- `scripts/seed.mjs` → `scripts/seed.ts`
- `scripts/refresh-epubs.mjs` → `scripts/refresh-epubs.ts`

**수정**

| 파일 | 변경 |
|---|---|
| `package.json` | `fflate`를 `devDependencies` → `dependencies`로 이동(필수). `seed`·`epubs:refresh` 스크립트 경로를 `.ts`로. |
| `src/app/admin/(dashboard)/books/page.tsx` | "위키문헌에서 가져오기" 버튼 추가. select에 `intro, rights_note` 추가. `미완성` 배지. |
| `src/app/admin/(dashboard)/books/[bookId]/page.tsx` | `searchParams` 수용 + `AdminToast` 추가 (지금 이 화면엔 알림이 없다). |
| `src/app/admin/(dashboard)/books/actions.ts` | 인라인 롤백 루프를 `removeUploaded`로 교체. |
| `src/components/admin/admin-toast.tsx` | `SUCCESS_KEYS`에 `imported`, `exists` 추가. |
| `docs/prd-ttokttok.md` | §5.10 임포트 항목, §5.11 임포트 경로·라이선스 판단, §6 `source_ref`, §11-48~51 결정 기록. |

---

## Task 1: 브랜치 격리와 `source_ref` 마이그레이션

`master`에서 브랜치를 따고 위키문헌 껍데기 제거 커밋만 가져온다. `feat/comment-threads` 위에 쌓지 않는 이유: 그 브랜치는 master가 가진 `vitest.config.ts`와 테스트를 갖고 있지 않고(package.json에서 vitest를 제거했다), 이 기능이 31개 미병합 커밋에 묶인다. worktree를 쓰는 이유: 이 저장소에 동시 작업 흔적이 있어 공용 체크아웃을 전환하면 그쪽을 방해한다.

> **Step 1~4는 컨트롤러가 이미 완료했다 (2026-09-04).** worktree `../ttokttok-wikisource-import`가 `feat/wikisource-import` 브랜치로 존재하고, `4e168cc` cherry-pick(→ `8924bb8`, 충돌 없음)·`.env` 복사·`npm install`이 끝났으며 기준선도 확인됐다(테스트 56개 통과, 빌드 성공). **Step 5부터 시작한다.**

**Files:**
- Create: `supabase/migrations/20260903000004_book_source_ref.sql`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `public.books.source_ref text` 컬럼, `books_source_ref_key` 부분 unique 인덱스. 이후 모든 태스크가 이 컬럼을 전제한다.

- [ ] **Step 1: master 기준 worktree 생성**

경로는 절대경로로 준다 — `git -C`의 상대경로는 `-C`가 아니라 프로세스의 현재 디렉터리를 기준으로 해석되어 엉뚱한 곳에 만들어진다.

```bash
git -C "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok" worktree add -b feat/wikisource-import "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-wikisource-import" master
```

기대 출력: `Preparing worktree (new branch 'feat/wikisource-import')` + `HEAD is now at b002a26 …`

이후 모든 작업은 `C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok-wikisource-import`에서 한다.

- [ ] **Step 2: 위키문헌 껍데기 제거 커밋을 가져온다**

```bash
git cherry-pick 4e168cc
```

`4e168cc`가 건드리는 파일: `scripts/lib/wikisource.mjs`(+167줄), `scripts/refresh-epubs.mjs`(신규 159줄), `package.json`(+1줄 `epubs:refresh`), `docs/prd-ttokttok.md`(+4줄).

`docs/prd-ttokttok.md`에서 충돌이 날 수 있다(master와 브랜치의 PRD가 37줄 다르다). 충돌하면 **양쪽 내용을 모두 살린다** — master의 문장을 지우지 말고 `4e168cc`가 추가한 4줄을 그 위에 얹는다. 해결 후:

```bash
git add docs/prd-ttokttok.md && git cherry-pick --continue
```

- [ ] **Step 3: 환경변수를 worktree로 복사한다**

`.env`·`.env.local`은 gitignore 대상이라 worktree에 따라오지 않는다. 없으면 `npm run dev`·`npm run seed`·`npm run epubs:refresh`가 전부 "NEXT_PUBLIC_SUPABASE_URL이 필요하다"로 죽는다.

```bash
cp "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok/.env" .
cp "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok/.env.local" .
```

확인: `ls -la .env .env.local` 로 두 파일이 보이면 된다.

이 계획 문서도 함께 가져와 새 브랜치에 커밋한다 — 원래 체크아웃에 커밋 안 된 상태로 있어서 worktree에는 따라오지 않는다.

```bash
cp "C:/Users/admin/Desktop/workspace/ttokttok-project/ttokttok/docs/superpowers/plans/2026-09-03-wikisource-admin-import.md" docs/superpowers/plans/
git add docs/superpowers/plans/2026-09-03-wikisource-admin-import.md
git commit -m "docs(plan): 위키문헌 EPUB 어드민 임포트 구현 계획"
```

- [ ] **Step 4: 의존성 설치 후 기준선 확인**

```bash
npm install
npm test
npm run build
```

기대: `npm test`는 `src/lib/`의 기존 테스트 4개(activity, comment-cache, comment-like, comments)가 PASS. `npm run build`는 성공. **여기서 실패하면 내 변경 때문이 아니므로 먼저 원인을 밝히고 진행한다.**

- [ ] **Step 5: 마이그레이션 파일 작성**

번호를 먼저 실측한다 — master가 움직여 이 번호는 이미 두 번 밀렸다:

```bash
ls supabase/migrations/ | tail -3
```

2026-09-04 기준 마지막은 `20260903000003_reply_addressee.sql`이므로 다음은 `20260903000004`다. **다르면 실측값 다음 번호를 쓰고 컨트롤러에게 보고한다.**

`supabase/migrations/20260903000004_book_source_ref.sql`:

```sql
-- ============================================================
-- books.source_ref — 수급 원천의 식별자 (PRD §5.11, 결정 기록 §11-50)
--
-- `source`는 'wikisource' | 'gongu' | 'manual' 처럼 경로만 적는다. 어느
-- 문서에서 왔는지가 남지 않아 ① 같은 책을 두 번 임포트해도 아무도 모르고
-- ② 원문이 개정됐을 때 재수급 대상을 찾을 수 없었다.
--
-- 형식은 URL이 아니라 **정규화한 문서 제목**이다 (퍼센트 디코드, `_`→공백).
-- ws-export의 입력으로 그대로 쓸 수 있고, 어드민에서 읽히고, 임포트·시드·
-- 재수급이 같은 함수(src/lib/wikisource.ts의 toPageTitle)를 거치므로
-- unique 인덱스가 실제로 중복을 잡는다. URL을 넣으면 인코딩·모바일 도메인
-- 차이로 같은 문서가 서로 다른 문자열이 된다.
-- ============================================================

alter table public.books add column source_ref text;

comment on column public.books.source_ref is
  '수급 원천의 식별자. 위키문헌은 정규화한 문서 제목(퍼센트 디코드, 밑줄→공백).';

-- 기존 위키문헌 8권 백필. 대개 도서 제목이 곧 문서 제목이지만, 동명 문서가
-- 있어 위키문헌 쪽에 괄호가 붙은 두 권은 따로 적는다 — 이 값은
-- scripts/refresh-epubs.mjs의 PAGE_OVERRIDES에 이미 적혀 있던 것을 옮긴 것이고,
-- 옮기고 나면 그 표를 지운다.
--
-- 백필을 생략하면 PAGE_OVERRIDES를 지운 직후 그 두 권의 재수급이 깨지고
-- "마이그레이션 뒤에 시드를 한 번 돌려야 한다"는 숨은 순서 의존이 생긴다.
update public.books
  set source_ref = title
  where source = 'wikisource' and source_ref is null;

update public.books
  set source_ref = '하늘과 바람과 별과 시 (1948년)'
  where source = 'wikisource' and title = '하늘과 바람과 별과 시';

update public.books
  set source_ref = '진달래꽃 (시집)'
  where source = 'wikisource' and title = '진달래꽃';

-- 수동 등록 도서는 source_ref가 null이고 그 수가 많아질 수 있다.
-- 전체 unique면 두 번째 null 행부터 막히므로 부분 인덱스여야 한다.
create unique index books_source_ref_key
  on public.books (source_ref)
  where source_ref is not null;
```

- [ ] **Step 6: 마이그레이션 적용**

```bash
npx supabase db push
```

기대: `20260903000004_book_source_ref.sql` 적용 성공.

원격에 붙지 않는 환경이면 Supabase 대시보드의 SQL 편집기에 위 파일 내용을 붙여 실행한다. 어느 쪽이든 **파일은 반드시 커밋한다** — `supabase/migrations/`가 스키마의 진실이다 (AGENTS.md).

- [ ] **Step 7: 적용 결과 확인**

Supabase 대시보드 SQL 편집기에서:

```sql
select title, source, source_ref from public.books where source = 'wikisource' order by title;
```

기대: 8행 전부 `source_ref`가 채워져 있고, 「하늘과 바람과 별과 시」는 `하늘과 바람과 별과 시 (1948년)`, 「진달래꽃」은 `진달래꽃 (시집)`.

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/20260903000004_book_source_ref.sql
git commit -m "feat(db): books.source_ref — 위키문헌 문서 제목을 기록해 중복 수급을 막는다"
```

---

## Task 2: 수급 로직을 `src/lib/wikisource.ts`로 승격

`scripts/lib/wikisource.mjs`를 앱이 쓸 수 있는 TypeScript 모듈로 옮기고, 이 기능에 필요한 함수 세 개(`toPageTitle`·`readEpubMetadata`·`assertClean`)를 더한다. 동시에 압축 왕복을 2회 → 1회로 줄인다: 지금 `stripFonts`와 `stripWikisourceChrome`이 **4.4MB를 각각 통째로 unzip → zipSync** 한다. 서버리스 함수로 들어가는 코드라 그 낭비를 그대로 옮길 이유가 없다.

**Files:**
- Create: `src/lib/wikisource.ts`
- Create: `src/lib/wikisource.test.ts`
- Delete: `scripts/lib/wikisource.mjs` (Task 3에서 참조를 끊은 뒤 삭제 — 이 태스크에서는 남겨 둔다)
- Modify: `package.json` (`fflate`를 dependencies로)

**Interfaces:**
- Consumes: 없음
- Produces:
  ```ts
  export function toPageTitle(input: string): string
  export function stripEpub(epub: Uint8Array): Uint8Array
  export function readEpubMetadata(epub: Uint8Array): { title: string | null; pageTitle: string | null }
  export function assertClean(epub: Uint8Array): number   // 통과 시 챕터 수, 실패 시 throw
  export async function fetchEpub(pageTitle: string): Promise<Uint8Array>
  ```
  모든 throw 메시지는 **관리자가 읽고 행동할 수 있는 한국어**다 — 임포트 액션이 그대로 배너에 띄운다.

- [ ] **Step 1: `fflate`를 dependencies로 옮긴다**

`package.json`의 `devDependencies`에서 `"fflate": "^0.8.3",` 줄을 지우고, `dependencies`에 알파벳 순서(`"epubjs"` 다음)로 넣는다:

```json
    "epubjs": "^0.3.93",
    "fflate": "^0.8.3",
    "lucide-react": "^1.34.0",
```

**선택이 아니라 필수다.** devDependency로 두면 앱 코드가 import한 순간 프로덕션 빌드가 깨진다.

- [ ] **Step 2: `toPageTitle`의 실패 테스트를 쓴다**

`src/lib/wikisource.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPageTitle } from "@/lib/wikisource";

describe("toPageTitle", () => {
  it("문서 제목을 그대로 받는다", () => {
    expect(toPageTitle("운수 좋은 날")).toBe("운수 좋은 날");
  });

  it("앞뒤 공백을 떼고 밑줄을 공백으로 바꾼다", () => {
    expect(toPageTitle("  운수_좋은_날  ")).toBe("운수 좋은 날");
  });

  it("위키문헌 주소에서 문서 제목을 뽑는다", () => {
    expect(
      toPageTitle(
        "https://ko.wikisource.org/wiki/%EC%9A%B4%EC%88%98_%EC%A2%8B%EC%9D%80_%EB%82%A0",
      ),
    ).toBe("운수 좋은 날");
  });

  it("모바일 도메인도 받는다", () => {
    expect(toPageTitle("https://ko.m.wikisource.org/wiki/봄봄")).toBe("봄봄");
  });

  it("?title= 형태도 받는다", () => {
    expect(
      toPageTitle("https://ko.wikisource.org/w/index.php?title=날개&action=raw"),
    ).toBe("날개");
  });

  it("판본 괄호를 보존한다", () => {
    expect(toPageTitle("진달래꽃 (시집)")).toBe("진달래꽃 (시집)");
  });

  it("한국 위키문헌이 아닌 주소는 거부한다", () => {
    expect(() => toPageTitle("https://en.wikisource.org/wiki/Ulysses")).toThrow(
      /ko\.wikisource\.org/,
    );
  });

  it("문서 주소가 아니면 거부한다", () => {
    expect(() => toPageTitle("https://ko.wikisource.org/")).toThrow(/문서 주소/);
  });

  it("빈 입력은 거부한다", () => {
    expect(() => toPageTitle("   ")).toThrow(/입력/);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는 걸 확인한다**

```bash
npm test -- src/lib/wikisource.test.ts
```

기대: FAIL — `Failed to resolve import "@/lib/wikisource"`

- [ ] **Step 4: `src/lib/wikisource.ts`를 만들고 `toPageTitle`을 구현한다**

`scripts/lib/wikisource.mjs`의 내용을 옮겨 오되 아래 형태로 재구성한다. **이 스텝에서는 파일 전체를 쓴다** (이후 스텝은 이 파일을 검증만 한다):

```ts
/**
 * 한국 위키문헌 → EPUB 수급 (PRD §5.11).
 *
 * ws-export(`ws-export.wmcloud.org`)가 위키문헌 페이지를 EPUB으로 만들어 준다.
 * 하위 페이지(장별 분할)와 ProofreadPage 트랜스클루전(PDF 스캔 교정본)도
 * 알아서 따라가므로, 목차 페이지 하나만 지정하면 된다.
 *
 * 다만 ws-export는 두 가지를 얹어서 준다.
 *
 * ① FreeSerif 4종(약 7.7MB)을 항상 임베드하고 끄는 옵션이 없다. 본문이
 *    34KB인 단편도 4.3MB가 되어 모바일에서 첫 페이지까지 한참 걸린다 —
 *    우리는 epub.js에 자체 CSS를 물리므로 이 폰트는 쓰이지도 않는다.
 * ② 위키문헌 자신의 껍데기: 로고가 박힌 표지 페이지, 기여자 목록이 담긴
 *    "About this digital edition", 본문 끝의 「라이선스」 안내 상자.
 *    우리 판본의 첫 화면이 남의 로고일 수는 없다.
 *
 * 그래서 받아온 뒤 둘을 함께 걷어낸다 (`stripEpub`). 다만 content.opf의
 * dc:rights(CC BY-SA 3.0 / GFDL)·dc:contributor 메타데이터는 **남긴다** —
 * 화면에 안 보이는 출처 기록이고, 지우는 건 권리 표시를 떼는 별개의
 * 판단이다. 수급 출처는 books.source·source_ref·rights_note에도 적힌다.
 *
 * 이 모듈은 앱(어드민 임포트)과 스크립트(seed·refresh-epubs)가 함께 쓰는
 * 유일한 원천이다. 그래서 두 가지 규약을 지킨다.
 *   - `import "server-only"`를 붙이지 않는다 — 붙이면 plain node로 도는
 *     스크립트가 실행 즉시 throw한다.
 *   - `Buffer`를 쓰지 않고 `Uint8Array`를 주고받는다 — 런타임 중립.
 */

import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  type Zippable,
} from "fflate";

const WS_EXPORT = "https://ws-export.wmcloud.org/";
const USER_AGENT = "ttokttok/0.1 (https://github.com/ttokttok; content sourcing)";

/** EPUB 스펙: mimetype은 첫 항목이어야 하고 압축하면 안 된다. */
const MIMETYPE = "mimetype";

/** 받아들이는 위키문헌 호스트 — 한국어판과 그 모바일 도메인만. */
const KO_WIKISOURCE_HOST = /^ko\.(m\.)?wikisource\.org$/i;

/**
 * 입력을 위키문헌 문서 제목으로 정규화한다.
 *
 * 관리자는 브라우저에서 문서를 찾아놓고 오므로 주소를 붙여넣는 게 자연스럽고,
 * 제목을 직접 타이핑하는 경우도 받는다. 결과 형식은 `books.source_ref`에
 * 그대로 저장되며 ws-export의 입력으로도 쓰인다 — 임포트·시드·재수급이
 * 전부 이 함수를 거쳐야 unique 인덱스가 중복을 잡는다.
 */
export function toPageTitle(input: string): string {
  const raw = input.trim();
  if (!raw) {
    throw new Error("위키문헌 문서 주소나 제목을 입력해 주세요.");
  }

  if (!/^https?:\/\//i.test(raw)) {
    return normalizeTitle(raw);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`주소를 읽을 수 없습니다: ${raw}`);
  }

  if (!KO_WIKISOURCE_HOST.test(url.hostname)) {
    throw new Error(
      `한국 위키문헌(ko.wikisource.org) 주소만 가져올 수 있습니다 — 받은 주소: ${url.hostname}`,
    );
  }

  const fromQuery = url.searchParams.get("title");
  if (fromQuery) return normalizeTitle(fromQuery);

  const WIKI = "/wiki/";
  if (!url.pathname.startsWith(WIKI)) {
    throw new Error(
      "문서 주소가 아닙니다 — ko.wikisource.org/wiki/문서제목 형태여야 합니다.",
    );
  }
  return normalizeTitle(url.pathname.slice(WIKI.length));
}

function normalizeTitle(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // 이미 디코드된 값에 `%`가 섞여 있으면 decodeURIComponent가 던진다.
    // 그 경우 원문을 그대로 쓴다 — 제목에 %가 들어간 문서가 있을 수 있다.
  }

  const title = decoded.replace(/_/g, " ").trim();
  if (!title) throw new Error("문서 제목이 비어 있습니다.");
  return title;
}

/**
 * 위키문헌 페이지를 EPUB으로 받아 폰트·껍데기를 걷어낸 바이트를 돌려준다.
 * @param pageTitle `toPageTitle`을 거친 문서 제목 (예: "운수 좋은 날")
 */
export async function fetchEpub(pageTitle: string): Promise<Uint8Array> {
  const url = `${WS_EXPORT}?format=epub&lang=ko&page=${encodeURIComponent(pageTitle)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  if (!res.ok) {
    console.error(`ws-export HTTP ${res.status} — ${url}`);
    throw new Error(
      `위키문헌에서 「${pageTitle}」을 받지 못했습니다 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!/epub/i.test(contentType)) {
    // ws-export는 문서를 못 찾으면 영문 HTML을 준다. 그 원문을 관리자
    // 화면에 그대로 띄우면 읽고 할 수 있는 일이 없다 — 로그로만 남긴다.
    const body = (await res.text()).slice(0, 500).replace(/\s+/g, " ");
    console.error(`ws-export가 EPUB이 아닌 응답을 줬다 (${pageTitle}): ${body}`);
    throw new Error(
      `위키문헌에서 「${pageTitle}」 문서를 찾지 못했습니다. 주소를 확인해 주세요.`,
    );
  }

  return stripEpub(new Uint8Array(await res.arrayBuffer()));
}

/** 위키문헌 껍데기 파일 — 우리 판본에 실리면 안 되는 것들. */
const CHROME_FILES = [/(^|\/)title\.xhtml$/i, /(^|\/)about\.xhtml$/i];

/**
 * 위키문헌·위키백과 로고와 라이선스 상자의 아이콘(PD 마크·경고 삼각형).
 * 위키백과 로고는 "정보" 페이지에서만 참조되므로, 그 페이지를 지우면
 * 참조 없는 고아 파일로 남는다 — 함께 걷어낸다.
 */
const CHROME_IMAGES = [
  /Wikisource-logo/i,
  /Wikipedia_logo/i,
  /PD_icon/i,
  /ructive_black_darkred/i,
];

/** 라이선스 상자를 여는 태그 — 클래스로만 식별된다(태그 종류는 책마다 다르다). */
const LICENSE_OPEN = /<(section|div)\b[^>]*class="[^"]*licenseContainer[^"]*"[^>]*>/i;

/**
 * `<tag …>`로 시작하는 지점부터 짝이 맞는 닫는 태그까지의 구간을 지운다.
 * 라이선스 상자는 div가 여러 겹 중첩돼 있어 단순 비탐욕 정규식으로는
 * 중간에서 끊긴다 — 깊이를 세야 통째로 걷어낼 수 있다.
 */
function removeBlockAt(html: string, tag: string, startIndex: number): string {
  const open = new RegExp(`<${tag}\\b`, "gi");
  const close = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 0;
  let i = startIndex;

  while (i < html.length) {
    open.lastIndex = i;
    close.lastIndex = i;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return html; // 짝이 없다 — 건드리지 않는다

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      i = nextOpen.index + 1;
      continue;
    }
    depth--;
    if (depth === 0) {
      return (
        html.slice(0, startIndex) + html.slice(nextClose.index + nextClose[0].length)
      );
    }
    i = nextClose.index + 1;
  }
  return html;
}

/**
 * 본문에서 「라이선스」 상자를 걷어낸다.
 *
 * ws-export는 상자를 `<section data-mw-section-id="…">`으로 감싸고 그 안에
 * 「라이선스」 제목까지 넣는다. 상자만 지우면 제목이 남으므로, 상자를 품은
 * 섹션을 통째로 지운다. 섹션 없이 div만 붙는 판본도 있어 그 경우도 처리한다.
 *
 * `<head>`의 CSS에도 `.licenseContainer{…}` 규칙이 들어 있는데, 이건 본문이
 * 아니라 스타일이라 마지막에 따로 지운다 — 먼저 문자열을 찾으면 CSS가
 * 걸려서 정작 본문 상자를 못 찾는다.
 */
function stripLicenseBlocks(html: string): string {
  let out = html;

  for (;;) {
    const hit = LICENSE_OPEN.exec(out);
    if (!hit) break;

    // 상자를 품은 섹션이 있으면 섹션째, 없으면 상자만 지운다.
    const sectionOpen = /<section\b[^>]*>/gi;
    let sectionStart = -1;
    for (let m; (m = sectionOpen.exec(out)) !== null && m.index < hit.index; ) {
      sectionStart = m.index;
    }

    const target =
      sectionStart !== -1
        ? { tag: "section", start: sectionStart }
        : { tag: hit[1], start: hit.index };

    const next = removeBlockAt(out, target.tag, target.start);
    if (next === out) break; // 못 지웠다 — 무한루프 방지
    out = next;
  }

  // 남은 CSS 규칙(선택자에 license가 들어간 것)도 함께 정리한다.
  return out.replace(/[^{}]*license[^{}]*\{[^}]*\}/gi, "");
}

/**
 * 임베드 폰트와 위키문헌 껍데기를 **한 번의 압축 왕복으로** 걷어낸다.
 *
 * 원래는 폰트 제거와 껍데기 제거가 별개 함수였고 각각 4.4MB를 통째로
 * unzip → zipSync 했다. 스크립트에서만 돌 때는 문제가 아니었지만 이제
 * 서버리스 함수 안에서 돌므로 그 왕복을 한 번으로 합쳤다.
 *
 * 파일만 지우면 안 된다 — content.opf의 manifest·spine, nav.xhtml, toc.ncx에
 * 남은 참조를 함께 끊어야 뷰어가 없는 파일을 찾지 않는다. main.css의
 * @font-face 선언도 같이 지운다.
 */
export function stripEpub(epub: Uint8Array): Uint8Array {
  const entries = unzipSync(epub);
  const dropped: string[] = [];
  const out: Record<string, Uint8Array> = {};

  for (const [path, data] of Object.entries(entries)) {
    const isFont = /(^|\/)fonts\//i.test(path);
    const isChromeFile = CHROME_FILES.some((re) => re.test(path));
    const isChromeImage =
      /(^|\/)images\//i.test(path) && CHROME_IMAGES.some((re) => re.test(path));

    if (isFont || isChromeFile || isChromeImage) {
      dropped.push(path.replace(/^.*\//, ""));
      continue;
    }
    out[path] = data;
  }

  const droppedHref = (href: string) =>
    dropped.some((name) => href.endsWith(name) || href.endsWith(encodeURI(name)));

  for (const [path, data] of Object.entries(out)) {
    if (/\.opf$/i.test(path)) {
      let opf = strFromU8(data);

      // 지운 파일의 manifest 항목과, 그 id를 가리키는 spine 항목을 함께 뺀다.
      const removedIds: string[] = [];
      opf = opf.replace(/<item\b[^>]*\/>\s*/gi, (item) => {
        const href = /href="([^"]*)"/i.exec(item)?.[1] ?? "";
        if (!droppedHref(href)) return item;
        const id = /id="([^"]*)"/i.exec(item)?.[1];
        if (id) removedIds.push(id);
        return "";
      });

      for (const id of removedIds) {
        opf = opf.replace(
          new RegExp(`<itemref\\b[^>]*idref="${id}"[^>]*/>\\s*`, "gi"),
          "",
        );
      }
      out[path] = strToU8(opf);
    } else if (/nav\.xhtml$/i.test(path)) {
      // 목차에서 표지·정보 항목을 뺀다 (뷰어 목차 시트에 그대로 노출된다).
      const nav = strFromU8(data).replace(
        /<li\b[^>]*>\s*<a\b[^>]*href="([^"]*)"[^>]*>.*?<\/a>\s*<\/li>\s*/gis,
        (li, href: string) => (droppedHref(href) ? "" : li),
      );
      out[path] = strToU8(nav);
    } else if (/toc\.ncx$/i.test(path)) {
      const ncx = strFromU8(data).replace(
        /<navPoint\b[\s\S]*?<\/navPoint>\s*/gi,
        (point) => {
          const href = /src="([^"]*)"/i.exec(point)?.[1] ?? "";
          return droppedHref(href) ? "" : point;
        },
      );
      out[path] = strToU8(ncx);
    } else if (/\.xhtml$/i.test(path)) {
      out[path] = strToU8(stripLicenseBlocks(strFromU8(data)));
    } else if (/\.css$/i.test(path)) {
      const css = strFromU8(data).replace(/@font-face\s*\{[^}]*\}\s*/gi, "");
      out[path] = strToU8(stripLicenseBlocks(css));
    }
  }

  // mimetype을 무압축으로 먼저 넣는다 (EPUB 스펙).
  const ordered: Zippable = {};
  if (out[MIMETYPE]) ordered[MIMETYPE] = [out[MIMETYPE], { level: 0 }];
  for (const [path, data] of Object.entries(out)) {
    if (path === MIMETYPE) continue;
    ordered[path] = data;
  }

  return zipSync(ordered, { level: 6 });
}

/**
 * EPUB에서 제목과 원본 문서 제목을 읽는다.
 *
 * ws-export는 `dc:title`과 `dc:source`(위키문헌 문서 URL)를 넣는다.
 * **`dc:creator`는 넣지 않는다** — 확인된 사실이고, 그래서 저자는 관리자가
 * 직접 입력한다 (결정 기록 §11-48).
 *
 * `dc:source`를 쓰는 이유: 위키문헌이 리다이렉트·표기를 정규화해 준
 * 최종 문서 주소라서, 관리자가 입력한 값보다 신뢰할 수 있다.
 */
export function readEpubMetadata(epub: Uint8Array): {
  title: string | null;
  pageTitle: string | null;
} {
  const entries = unzipSync(epub);
  const opfPath = Object.keys(entries).find((p) => /\.opf$/i.test(p));
  if (!opfPath) return { title: null, pageTitle: null };

  const opf = strFromU8(entries[opfPath]);
  const title = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i.exec(opf)?.[1]?.trim();
  const source =
    /<dc:source\b[^>]*>([\s\S]*?)<\/dc:source>/i.exec(opf)?.[1]?.trim() ??
    /<dc:identifier\b[^>]*>([\s\S]*?)<\/dc:identifier>/i.exec(opf)?.[1]?.trim();

  let pageTitle: string | null = null;
  if (source) {
    try {
      pageTitle = toPageTitle(source);
    } catch {
      // dc:source가 위키문헌 주소가 아니면 무시한다 — 호출자가 관리자
      // 입력값으로 대체한다.
      pageTitle = null;
    }
  }

  return { title: title || null, pageTitle };
}

/**
 * 업로드 직전 관문 — 수급 파이프라인이 제 일을 했는지 확인한다.
 *
 * 껍데기가 남은 파일이 조용히 올라가면 뷰어를 열어 보기 전까지 아무도
 * 모른다. 정규식으로 XML을 주무르는 처리라 위키문헌이 마크업을 바꾸면
 * 언제든 헛돌 수 있다.
 *
 * @returns 본문 챕터 수
 */
export function assertClean(epub: Uint8Array): number {
  const entries = unzipSync(epub);
  const paths = Object.keys(entries);
  const body = paths
    .filter((p) => /\.xhtml$/i.test(p))
    .map((p) => strFromU8(entries[p]))
    .join("");

  const problems: string[] = [];
  if (paths[0] !== MIMETYPE) problems.push("mimetype이 첫 항목이 아님");
  if (paths.some((p) => /(^|\/)title\.xhtml$/i.test(p))) problems.push("title.xhtml");
  if (paths.some((p) => /(^|\/)about\.xhtml$/i.test(p))) problems.push("about.xhtml");
  if (paths.some((p) => /Wikisource-logo/i.test(p))) problems.push("위키문헌 로고");
  if (paths.some((p) => /Wikipedia_logo/i.test(p))) problems.push("위키백과 로고");
  if (paths.some((p) => /(^|\/)fonts\//i.test(p))) problems.push("임베드 폰트");
  if (/licenseContainer/i.test(body)) problems.push("라이선스 상자");

  const chapters = paths.filter((p) => /\/c\d+_.*\.xhtml$/i.test(p)).length;
  if (chapters === 0) problems.push("본문 챕터 없음");

  if (problems.length > 0) {
    throw new Error(
      `받아온 EPUB 정리에 실패했습니다 — ${problems.join(", ")}. ` +
        `위키문헌의 문서 구조가 바뀌었을 수 있습니다 (src/lib/wikisource.ts).`,
    );
  }
  return chapters;
}
```

- [ ] **Step 5: `toPageTitle` 테스트가 통과하는 걸 확인한다**

```bash
npm test -- src/lib/wikisource.test.ts
```

기대: `toPageTitle` 9개 PASS.

- [ ] **Step 6: `stripEpub`·`assertClean`·`readEpubMetadata`의 실패 테스트를 추가한다**

`src/lib/wikisource.test.ts` 끝에 붙인다. **픽스처는 바이너리를 커밋하지 않고 여기서 조립한다** — 실물 EPUB은 4.4MB이고 그 대부분이 우리가 지울 폰트다.

먼저 파일 **맨 위**의 import 블록을 아래로 교체한다 (ESM에서 import는 호이스팅되지만 파일 중간에 두면 읽기 어렵고 `import/first` 계열 린트에 걸린다):

```ts
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import {
  assertClean,
  readEpubMetadata,
  stripEpub,
  toPageTitle,
} from "@/lib/wikisource";
```

그리고 파일 끝에 다음을 붙인다:

```ts
/**
 * ws-export 출력의 최소 재현.
 *
 * 실물 EPUB(4.4MB)을 픽스처로 커밋하지 않는 이유: 용량의 대부분이 우리가
 * 지울 폰트이고, 검증하려는 건 "무엇을 지우고 참조를 어떻게 끊는가"라서
 * 구조만 있으면 충분하다. 구조는 실제 응답에서 확인한 것과 같다 —
 * OPS/ 아래 content.opf·nav.xhtml·toc.ncx·title.xhtml·about.xhtml,
 * `c0_` 접두 본문, images/·fonts/.
 */
function makeFixture(): Uint8Array {
  const files: Zippable = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/content.opf"/></rootfiles></container>`,
    ),
    "OPS/content.opf": strToU8(
      `<?xml version="1.0"?>
<package version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">https://ko.wikisource.org/wiki/%EC%9A%B4%EC%88%98_%EC%A2%8B%EC%9D%80_%EB%82%A0</dc:identifier>
<dc:title id="meta-title">운수 좋은 날</dc:title>
<dc:source>https://ko.wikisource.org/wiki/%EC%9A%B4%EC%88%98_%EC%A2%8B%EC%9D%80_%EB%82%A0</dc:source>
<dc:rights xml:lang="en">Creative Commons BY-SA 3.0</dc:rights>
<dc:contributor id="meta-bkp">Wikisource</dc:contributor>
</metadata>
<manifest>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml" />
<item id="about" href="about.xhtml" media-type="application/xhtml+xml" />
<item id="c0" href="c0_unsu.xhtml" media-type="application/xhtml+xml" />
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
<item id="css" href="main.css" media-type="text/css" />
<item id="logo" href="images/Wikisource-logo.svg.png" media-type="image/png" />
<item id="wplogo" href="images/c1_Wikipedia_logo_v2.svg.png" media-type="image/png" />
<item id="f1" href="fonts/FreeSerif.ttf" media-type="application/font-sfnt" />
</manifest>
<spine toc="ncx">
<itemref idref="title" />
<itemref idref="c0" />
<itemref idref="about" />
</spine>
</package>`,
    ),
    "OPS/nav.xhtml": strToU8(
      `<html><body><nav epub:type="toc"><ol>
<li id="toc-title"><a href="title.xhtml">표지</a></li>
<li id="toc-c0"><a href="c0_unsu.xhtml">운수 좋은 날</a></li>
<li id="toc-about"><a href="about.xhtml">정보</a></li>
</ol></nav></body></html>`,
    ),
    "OPS/toc.ncx": strToU8(
      `<ncx><navMap>
<navPoint id="title"><navLabel><text>표지</text></navLabel><content src="title.xhtml"/></navPoint>
<navPoint id="c0"><navLabel><text>운수 좋은 날</text></navLabel><content src="c0_unsu.xhtml"/></navPoint>
<navPoint id="about"><navLabel><text>정보</text></navLabel><content src="about.xhtml"/></navPoint>
</navMap></ncx>`,
    ),
    "OPS/title.xhtml": strToU8(
      `<html><body><img src="images/Wikisource-logo.svg.png"/></body></html>`,
    ),
    "OPS/about.xhtml": strToU8(
      `<html><body><h1>정보</h1><img src="images/c1_Wikipedia_logo_v2.svg.png"/></body></html>`,
    ),
    // 라이선스 상자는 섹션 안에 「라이선스」 제목과 함께 들어 있고,
    // 상자 자체가 div로 여러 겹 중첩돼 있다.
    "OPS/c0_unsu.xhtml": strToU8(
      `<html><body>
<section data-mw-section-id="0"><p>새침하게 흐린 품이 눈이 올 듯하더니</p></section>
<section data-mw-section-id="1"><h2>라이선스</h2>
<div class="licenseContainer licenseBanner"><div class="inner"><div class="deep">CC BY-SA 3.0</div></div></div>
</section>
</body></html>`,
    ),
    "OPS/main.css": strToU8(
      `@font-face { font-family: "FreeSerif"; src: url(fonts/FreeSerif.ttf); }
body { margin: 0; }
.licenseContainer { border: 1px solid; }`,
    ),
    "OPS/images/Wikisource-logo.svg.png": new Uint8Array([1, 2, 3]),
    "OPS/images/c1_Wikipedia_logo_v2.svg.png": new Uint8Array([4, 5, 6]),
    "OPS/fonts/FreeSerif.ttf": new Uint8Array(1024),
  };
  return zipSync(files, { level: 6 });
}

const read = (epub: Uint8Array) => {
  const entries = unzipSync(epub);
  return {
    paths: Object.keys(entries),
    text: (p: string) => strFromU8(entries[p]),
  };
};

describe("stripEpub", () => {
  it("폰트 파일과 @font-face 선언을 지운다", () => {
    const { paths, text } = read(stripEpub(makeFixture()));
    expect(paths.some((p) => /fonts\//.test(p))).toBe(false);
    expect(text("OPS/main.css")).not.toMatch(/@font-face/);
    expect(text("OPS/main.css")).toMatch(/body \{ margin: 0; \}/);
  });

  it("표지·정보 페이지와 로고 이미지를 지운다", () => {
    const { paths } = read(stripEpub(makeFixture()));
    expect(paths).not.toContain("OPS/title.xhtml");
    expect(paths).not.toContain("OPS/about.xhtml");
    expect(paths).not.toContain("OPS/images/Wikisource-logo.svg.png");
    expect(paths).not.toContain("OPS/images/c1_Wikipedia_logo_v2.svg.png");
  });

  it("본문 챕터는 남긴다", () => {
    const { paths, text } = read(stripEpub(makeFixture()));
    expect(paths).toContain("OPS/c0_unsu.xhtml");
    expect(text("OPS/c0_unsu.xhtml")).toMatch(/새침하게 흐린 품이/);
  });

  it("지운 파일의 manifest 항목과 spine 참조를 함께 끊는다", () => {
    const opf = read(stripEpub(makeFixture())).text("OPS/content.opf");
    expect(opf).not.toMatch(/title\.xhtml/);
    expect(opf).not.toMatch(/about\.xhtml/);
    expect(opf).not.toMatch(/fonts\/FreeSerif\.ttf/);
    expect(opf).not.toMatch(/idref="title"/);
    expect(opf).not.toMatch(/idref="about"/);
    expect(opf).toMatch(/idref="c0"/);
  });

  it("nav.xhtml과 toc.ncx의 목차 항목을 끊는다", () => {
    const { text } = read(stripEpub(makeFixture()));
    expect(text("OPS/nav.xhtml")).not.toMatch(/표지/);
    expect(text("OPS/nav.xhtml")).not.toMatch(/정보/);
    expect(text("OPS/nav.xhtml")).toMatch(/운수 좋은 날/);
    expect(text("OPS/toc.ncx")).not.toMatch(/title\.xhtml/);
    expect(text("OPS/toc.ncx")).not.toMatch(/about\.xhtml/);
    expect(text("OPS/toc.ncx")).toMatch(/c0_unsu\.xhtml/);
  });

  it("중첩된 라이선스 상자를 「라이선스」 제목까지 통째로 지운다", () => {
    const body = read(stripEpub(makeFixture())).text("OPS/c0_unsu.xhtml");
    expect(body).not.toMatch(/licenseContainer/);
    expect(body).not.toMatch(/라이선스/);
    expect(body).not.toMatch(/CC BY-SA/);
    // 본문 섹션은 살아 있어야 한다 — 섹션 단위로 지우므로 실수하기 쉽다.
    expect(body).toMatch(/새침하게 흐린 품이/);
  });

  it("dc:rights와 dc:contributor 메타데이터는 남긴다", () => {
    const opf = read(stripEpub(makeFixture())).text("OPS/content.opf");
    expect(opf).toMatch(/Creative Commons BY-SA 3\.0/);
    expect(opf).toMatch(/<dc:contributor[^>]*>Wikisource<\/dc:contributor>/);
  });

  it("mimetype을 첫 항목으로, 무압축으로 남긴다", () => {
    const out = stripEpub(makeFixture());
    expect(Object.keys(unzipSync(out))[0]).toBe("mimetype");
    // zip 로컬 파일 헤더: 0~3 서명, 8~9 압축 방식. 0이면 stored(무압축).
    expect(out[0]).toBe(0x50);
    expect(out[1]).toBe(0x4b);
    expect(out[8] | (out[9] << 8)).toBe(0);
  });
});

describe("readEpubMetadata", () => {
  it("dc:title과 dc:source에서 제목·문서 제목을 읽는다", () => {
    expect(readEpubMetadata(stripEpub(makeFixture()))).toEqual({
      title: "운수 좋은 날",
      pageTitle: "운수 좋은 날",
    });
  });
});

describe("assertClean", () => {
  it("정리된 EPUB은 통과하고 챕터 수를 준다", () => {
    expect(assertClean(stripEpub(makeFixture()))).toBe(1);
  });

  it("정리하지 않은 EPUB은 무엇이 남았는지 알려주며 실패한다", () => {
    expect(() => assertClean(makeFixture())).toThrow(/title\.xhtml/);
    expect(() => assertClean(makeFixture())).toThrow(/라이선스 상자/);
    expect(() => assertClean(makeFixture())).toThrow(/임베드 폰트/);
  });
});
```

- [ ] **Step 7: 테스트를 돌린다**

```bash
npm test -- src/lib/wikisource.test.ts
```

기대: 전부 PASS (toPageTitle 9 + stripEpub 8 + readEpubMetadata 1 + assertClean 2 = 20개).

실패하면 **테스트가 아니라 구현을 고친다** — 픽스처 구조는 실제 ws-export 응답에서 확인한 것이다. 단, `assertClean(makeFixture())`가 `mimetype이 첫 항목이 아님`으로 먼저 걸려 다른 메시지를 못 볼 수 있다: `zipSync`가 넣은 순서를 유지하므로 픽스처의 `mimetype`은 첫 항목이 맞다. 그래도 걸리면 픽스처의 키 순서를 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add package.json src/lib/wikisource.ts src/lib/wikisource.test.ts
git commit -m "feat(lib): 위키문헌 수급 로직을 앱·스크립트 공용 모듈로 승격

압축 왕복을 2회에서 1회로 줄이고, 문서 제목 정규화·EPUB 메타 읽기·
업로드 직전 관문을 더했다. 서버리스 함수와 node 스크립트가 같은 원천을
쓰도록 server-only를 붙이지 않고 Uint8Array를 주고받는다."
```

---

## Task 3: 스크립트를 공용 모듈에 붙인다

`scripts/lib/wikisource.mjs`를 지우고 두 스크립트를 `.ts`로 옮겨 `src/lib/wikisource.ts`를 쓰게 한다. Node v24는 타입 스트리핑이 기본 동작하므로 `.ts`를 그대로 실행한다 — 단 **`@/` 경로 별칭은 동작하지 않으므로 상대경로로 import한다.**

동시에 `refresh-epubs`의 `PAGE_OVERRIDES` 하드코딩 표를 지운다. 그 표의 주석이 *"DB에는 문서 제목을 담을 칸이 없어서 여기 적는다"* 라고 적어 둔 그 칸이 Task 1의 `source_ref`다.

**Files:**
- Create: `scripts/seed.ts` (from `scripts/seed.mjs`)
- Create: `scripts/refresh-epubs.ts` (from `scripts/refresh-epubs.mjs`)
- Delete: `scripts/seed.mjs`, `scripts/refresh-epubs.mjs`, `scripts/lib/wikisource.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `toPageTitle`, `fetchEpub`, `assertClean` from `../src/lib/wikisource.ts`; `books.source_ref` (Task 1)
- Produces: `npm run seed`가 `source_ref`를 채운다. `npm run epubs:refresh`가 `source_ref`로 문서를 찾는다.

- [ ] **Step 1: 파일 이름을 바꾼다**

```bash
git mv scripts/seed.mjs scripts/seed.ts
git mv scripts/refresh-epubs.mjs scripts/refresh-epubs.ts
git rm scripts/lib/wikisource.mjs
```

- [ ] **Step 2: `scripts/seed.ts`의 import와 `source_ref`를 손본다**

import 줄을 바꾼다 (`@/` 별칭은 node 타입 스트리핑에서 동작하지 않는다):

```ts
import { fetchEpub } from "../src/lib/wikisource.ts";
```

`books` upsert의 매핑에 `source_ref`를 추가한다. `b.wikisource`가 있으면 그게 위키문헌 문서 제목이고, 없으면 도서 제목이 곧 문서 제목이다 — `fetchEpub`에 넘기는 값과 **반드시 같아야** unique 인덱스가 중복을 잡는다:

```ts
        epub_path: epubPaths.get(b.id),
        source: "wikisource",
        source_ref: b.wikisource ?? b.title,
        rights_note: b.rights,
```

- [ ] **Step 3: `scripts/refresh-epubs.ts`에서 `PAGE_OVERRIDES`를 없앤다**

import를 바꾸고 `assertClean`을 공용 모듈에서 가져온다 (로컬 정의를 삭제):

```ts
import { createClient } from "@supabase/supabase-js";
import { assertClean, fetchEpub } from "../src/lib/wikisource.ts";
```

`PAGE_OVERRIDES` 상수 선언과 로컬 `assertClean` 함수 정의를 **통째로 삭제**하고, `fflate` import(`unzipSync`, `strFromU8`)도 지운다 — 이제 쓰지 않는다.

select에 `source_ref`를 추가한다:

```ts
  const { data: books, error } = await db
    .from("books")
    .select("id, title, source, source_ref, epub_path")
    .eq("source", "wikisource")
    .not("epub_path", "is", null)
    .order("title");
```

문서 제목을 고르는 줄을 바꾼다:

```ts
    // 문서 제목은 DB가 안다 (books.source_ref) — 하드코딩 대응표가 있던 자리다.
    const page = book.source_ref ?? book.title;
```

- [ ] **Step 4: `package.json`의 스크립트 경로를 바꾼다**

```json
    "seed": "node --env-file=.env scripts/seed.ts",
    "covers": "node --env-file=.env scripts/generate-covers.mjs",
    "epubs:refresh": "node --env-file=.env scripts/refresh-epubs.ts",
```

`generate-covers.mjs`는 그대로 둔다 — 이 작업과 무관하고 `sharp`를 쓰는 별개 경로다.

- [ ] **Step 5: 재수급 스크립트를 실제로 돌려 확인한다**

```bash
npm run epubs:refresh -- --dry-run
```

기대: 8권 전부 `· 제목 — NNN KB, 챕터 N개 (검사 통과)` 그리고 마지막에 `검사 8권`. 업로드는 하지 않는다.

이 한 번의 실행이 세 가지를 동시에 증명한다 — Node가 `.ts`를 실행한다, `src/lib/wikisource.ts`의 `stripEpub`·`assertClean`이 실물 EPUB에서 동작한다, `source_ref` 백필이 맞다(「진달래꽃」·「하늘과 바람과 별과 시」가 실패하지 않는다).

**「진달래꽃」이나 「하늘과 바람과 별과 시」가 "문서를 찾지 못했습니다"로 실패하면** Task 1 Step 6의 백필이 안 된 것이다. 스크립트에 표를 되살리지 말고 DB를 고친다.

- [ ] **Step 6: 타입체크**

```bash
npm run build
```

기대: 성공. `scripts/`는 `tsconfig.json`의 include에 없을 수 있어 타입체크 대상이 아닐 수 있다 — 그 경우에도 Step 5의 실제 실행이 검증을 맡는다.

- [ ] **Step 7: 커밋**

```bash
git add -A scripts package.json
git commit -m "refactor(scripts): 시드·재수급이 공용 수급 모듈을 쓴다

문서 제목 하드코딩 대응표(PAGE_OVERRIDES)를 지우고 books.source_ref로
대체했다. 그 표의 주석이 '담을 칸이 없어서 여기 적는다'고 적어 둔 칸이다."
```

---

## Task 4: 업로드 되돌리기를 공용 헬퍼로 추출

임포트 액션도 "파일은 올라갔는데 INSERT가 실패"를 겪는다. `saveBook`에 이미 그 처리가 인라인으로 있으니 한 곳으로 모은다. **`books/actions.ts`에 둘 수 없다** — 그 파일은 `"use server"`라서 export가 전부 서버 액션이 된다.

**Files:**
- Create: `src/lib/admin-storage.ts`
- Modify: `src/app/admin/(dashboard)/books/actions.ts`

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`
- Produces:
  ```ts
  export type UploadedFile = { bucket: string; path: string };
  export async function removeUploaded(files: UploadedFile[]): Promise<void>;
  ```

- [ ] **Step 1: `src/lib/admin-storage.ts`를 만든다**

```ts
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** 되돌릴 대상 — 어느 버킷의 어느 경로에 올렸는가. */
export type UploadedFile = { bucket: string; path: string };

/**
 * 실패한 저장의 뒤처리.
 *
 * 도서 저장은 "파일 업로드 → 행 쓰기" 순서다. 뒤가 실패하면 **아무도
 * 가리키지 않는 파일만 버킷에 남는다.** 비공개 버킷이라 눈에 띄지도 않는다.
 *
 * 여기서 나는 오류는 던지지 않는다 — 이 함수를 부르는 시점에 이미 알려야
 * 할 실패가 있고, 뒤처리 실패로 그 메시지를 덮으면 관리자는 정작 고쳐야
 * 할 것을 못 본다. 로그로만 남긴다.
 *
 * 비공개 버킷 접근이 필요해 service role로 처리한다 (FRONTEND.md §5).
 */
export async function removeUploaded(files: UploadedFile[]): Promise<void> {
  if (files.length === 0) return;

  const admin = createAdminClient();
  for (const file of files) {
    const { error } = await admin.storage.from(file.bucket).remove([file.path]);
    if (error) {
      console.error(
        `업로드 되돌리기 실패 ${file.bucket}/${file.path}: ${error.message}`,
      );
    }
  }
}
```

- [ ] **Step 2: `saveBook`이 그것을 쓰게 한다**

`src/app/admin/(dashboard)/books/actions.ts`의 import에 추가:

```ts
import { removeUploaded, type UploadedFile } from "@/lib/admin-storage";
```

`uploaded` 선언의 타입을 바꾼다:

```ts
  // 신규 저장이 실패하면 방금 올린 파일만 남는다 — 되돌리려고 기록해 둔다.
  const uploaded: UploadedFile[] = [];
```

`fail`의 루프를 교체한다:

```ts
  async function fail(message: string): Promise<never> {
    // 수정이면 기존 파일을 교체한 것이므로 지우지 않는다 — 지우면 멀쩡했던
    // 도서의 본문이 사라진다.
    if (!id) await removeUploaded(uploaded);
    redirect(`/admin/books?error=${encodeURIComponent(humanize(message))}`);
  }
```

- [ ] **Step 3: 타입체크와 기존 동작 확인**

```bash
npm run build
```

기대: 성공.

그리고 실제로 확인한다 — `npm run dev` 후 `/admin/books/new`에서 **EPUB도 ISBN도 구매 링크도 없는** 도서를 저장 시도한다.

기대: `/admin/books`로 돌아오며 배너에 "EPUB 파일이 없으면 ISBN이나 구매 링크 중 하나는 있어야 합니다 (링크형 도서)." 리팩터링이 기존 동작을 바꾸지 않았다는 뜻이다.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/admin-storage.ts "src/app/admin/(dashboard)/books/actions.ts"
git commit -m "refactor(admin): 실패한 저장의 업로드 되돌리기를 공용 헬퍼로"
```

---

## Task 5: 임포트 화면과 서버 액션

**Files:**
- Create: `src/app/admin/(dashboard)/books/import/page.tsx`
- Create: `src/app/admin/(dashboard)/books/import/actions.ts`

**Interfaces:**
- Consumes: `toPageTitle`, `fetchEpub`, `assertClean`, `readEpubMetadata` (Task 2) · `removeUploaded`, `UploadedFile` (Task 4) · `books.source_ref` (Task 1) · `requireAdmin` from `@/lib/admin-guard` · `createClient` from `@/lib/supabase/server` · `createAdminClient` from `@/lib/supabase/admin`
- Produces: `importFromWikisource(formData: FormData): Promise<void>` 서버 액션. 성공 시 `/admin/books/{id}?imported=1`로, 이미 등록된 문서면 `/admin/books/{기존id}?exists=1`로, 실패면 `/admin/books/import?error=…`로 리다이렉트한다.

- [ ] **Step 1: 서버 액션을 만든다**

`src/app/admin/(dashboard)/books/import/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { removeUploaded, type UploadedFile } from "@/lib/admin-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  assertClean,
  fetchEpub,
  readEpubMetadata,
  toPageTitle,
} from "@/lib/wikisource";

/**
 * 위키문헌 EPUB 임포트 (PRD §5.10, §5.11).
 *
 * 관리자가 문서 주소·저자·카테고리를 넣으면 본문을 받아 정리해 올리고
 * `books` 행을 **바로 만든다**. 그리고 수정 화면으로 보낸다 —
 * 소개·인용구·권리 근거는 편집 판단이라 기계가 채울 수 없고, 저자는
 * ws-export가 `dc:creator`를 아예 넣지 않아 원천이 없다 (§11-48).
 *
 * 제목은 `dc:title`로 채운다. 위키문헌 문서 제목에는 「진달래꽃 (시집)」
 * 처럼 판본 괄호가 붙는 경우가 있고 **그걸 자동으로 떼지 않는다** —
 * 규칙화하면 정상 제목의 괄호까지 먹는다. 수정 화면에서 사람이 고친다.
 */

/**
 * 등록 금지 저작자 (PRD §5.11).
 *
 * 위키문헌에 문서가 있다는 사실이 "공개해도 된다"로 오독되는 지점이
 * 여기다 — 위키문헌은 우리와 다른 기준으로 운영된다. 그래서 임포트
 * 경로에만 관문을 둔다. 수동 등록(saveBook)은 막지 않는다: 손으로 적어
 * 넣는 행위에는 이런 오독이 끼어들지 않는다.
 */
const BLOCKED_AUTHORS: Record<string, string> = {
  정지용: "월북·납북 작가 — 사망 연도가 불확실합니다",
  이태준: "월북·납북 작가 — 사망 연도가 불확실합니다",
  박태원: "월북·납북 작가 — 사망 연도가 불확실합니다",
  홍명희: "월북·납북 작가 — 사망 연도가 불확실합니다",
  김기림: "월북·납북 작가 — 사망 연도가 불확실합니다",
  백석: "1996년 사망 — 저작권이 존속합니다 (사후 70년)",
  박경리: "2008년 사망 — 저작권이 존속합니다 (사후 70년)",
};

const str = (fd: FormData, key: string) =>
  String(fd.get(key) ?? "").trim() || null;

/**
 * 오류를 안고 임포트 화면으로 되돌린다.
 *
 * **화살표 함수가 아니라 함수 선언이어야 한다.** 타입스크립트의 제어 흐름
 * 분석은 `never`를 돌려주는 호출 뒤를 도달 불가로 보는데, 그 판단은 호출
 * 대상이 함수 선언(또는 명시적 타입을 가진 const 변수)일 때만 적용된다.
 * `const back = (m: string): never => …` 로 쓰면 아래에서 `source`가
 * `string | null`로 남아 타입 오류가 난다.
 */
function back(message: string): never {
  redirect(`/admin/books/import?error=${encodeURIComponent(message)}`);
}

export async function importFromWikisource(formData: FormData) {
  await requireAdmin();

  const source = str(formData, "source");
  const author = str(formData, "author");
  const category = str(formData, "category");

  if (!source || !author || !category) {
    back("문서 주소·저자·카테고리는 모두 필요합니다.");
  }

  const blocked = BLOCKED_AUTHORS[author.replace(/\s+/g, "")];
  if (blocked) {
    back(`「${author}」은 등록할 수 없습니다 — ${blocked} (PRD §5.11 등록 금지 목록).`);
  }

  // redirect()는 예외를 던져 동작한다. try 안에서 부르면 그 catch가
  // 리다이렉트를 삼키므로, 던질 수 있는 호출만 좁게 감싸고 결과를 밖에서 쓴다.
  let pageTitle: string;
  try {
    pageTitle = toPageTitle(source);
  } catch (err) {
    back(err instanceof Error ? err.message : "문서 주소를 읽을 수 없습니다.");
  }

  const db = await createClient();

  // 4MB를 받기 전에 먼저 확인한다. unique 인덱스는 최종 방어선으로 남긴다.
  const { data: existing } = await db
    .from("books")
    .select("id")
    .eq("source_ref", pageTitle)
    .maybeSingle();

  if (existing) {
    redirect(`/admin/books/${existing.id}?exists=1`);
  }

  let epub: Uint8Array;
  try {
    epub = await fetchEpub(pageTitle);
    assertClean(epub);
  } catch (err) {
    back(err instanceof Error ? err.message : "본문을 받지 못했습니다.");
  }

  const meta = readEpubMetadata(epub);

  // 파일 경로에 id가 필요하지만 행을 먼저 만들 수는 없다 — EPUB 없이
  // INSERT하면 books_needs_epub_or_store_ref CHECK에 걸린다. id를 여기서
  // 정하고 업로드를 끝낸 뒤 한 번에 INSERT한다 (saveBook과 같은 순서).
  const bookId = crypto.randomUUID();
  const path = `${bookId}.epub`;
  const uploaded: UploadedFile[] = [];

  // 비공개 버킷 접근이 필요해 스토리지만 service role로 처리한다.
  const admin = createAdminClient();
  const { error: upErr } = await admin.storage
    .from("epubs")
    .upload(path, epub, { contentType: "application/epub+zip", upsert: true });

  if (upErr) {
    back(`본문 업로드에 실패했습니다: ${upErr.message}`);
  }
  uploaded.push({ bucket: "epubs", path });

  // 행 쓰기는 RLS 클라이언트로 — 보안은 RLS가 담당한다 (FRONTEND.md §5).
  const { error: insertErr } = await db.from("books").insert({
    id: bookId,
    title: meta.title ?? pageTitle,
    author,
    category,
    epub_path: path,
    file_size_mb: Math.round((epub.length / 1024 / 1024) * 100) / 100,
    source: "wikisource",
    source_ref: meta.pageTitle ?? pageTitle,
  });

  if (insertErr) {
    await removeUploaded(uploaded);
    back(
      /books_source_ref_key/.test(insertErr.message)
        ? "이미 등록된 위키문헌 문서입니다."
        : insertErr.message,
    );
  }

  revalidatePath("/admin/books");
  redirect(`/admin/books/${bookId}?imported=1`);
}
```

- [ ] **Step 2: 임포트 화면을 만든다**

`src/app/admin/(dashboard)/books/import/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNotice } from "@/components/admin/admin-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importFromWikisource } from "./actions";

export const metadata: Metadata = { title: "위키문헌에서 가져오기" };

/**
 * ws-export는 EPUB을 요청 시점에 생성한다. 단편은 3초쯤이지만 하위 페이지가
 * 많은 장편은 수십 초가 걸린다. `maxDuration`을 여기 선언하지 않는 이유:
 * 플랜 상한보다 큰 값을 쓰면 Vercel 배포 자체가 실패하고, 60을 못박으면
 * Pro의 더 높은 기본값을 스스로 깎는다. 장편이 타임아웃하면 Pro에서
 * `export const maxDuration = 300`을 여기 추가하고, Hobby면 상한이 60초라
 * 올릴 수 없다 — 그 경우 `npm run seed` 경로로 처리한다.
 */

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function ImportBookPage({
  searchParams,
}: PageProps<"/admin/books/import">) {
  const sp = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">위키문헌에서 가져오기</h1>
        <p className="text-muted-foreground text-sm">
          본문(EPUB)을 받아 정리해 올리고 도서를 만듭니다. 소개·인용구·권리
          근거는 이어지는 수정 화면에서 채웁니다.
        </p>
      </header>

      <AdminNotice error={q(sp.error)} />

      <form action={importFromWikisource} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="source">위키문헌 문서 주소 또는 제목 *</Label>
          <Input
            id="source"
            name="source"
            required
            placeholder="https://ko.wikisource.org/wiki/운수_좋은_날"
          />
          <p className="text-muted-foreground text-xs">
            주소를 붙여넣거나 문서 제목을 그대로 적습니다. 동명 문서가 있으면
            위키문헌 쪽 제목에 괄호가 붙습니다 — 「진달래꽃 (시집)」처럼 문서
            제목 그대로 넣으세요.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="author">저자 *</Label>
            <Input id="author" name="author" required placeholder="현진건" />
            <p className="text-muted-foreground text-xs">
              위키문헌 EPUB에는 저자 정보가 없어 직접 입력해야 합니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="category">카테고리 *</Label>
            <Input
              id="category"
              name="category"
              required
              placeholder="소설 / 시 / 수필…"
            />
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          저작권이 만료된 저작물만 등록합니다 — 저작자가 1962년 이전에 사망한
          경우입니다 (PRD §5.11). 월북·납북 작가와 저작권이 존속하는 작가는
          자동으로 거부됩니다.
        </p>

        <div className="flex gap-2">
          <Button type="submit" size="lg" className="min-h-11">
            가져오기
          </Button>
          <Button asChild variant="ghost" size="lg" className="min-h-11">
            <Link href="/admin/books">취소</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npm run build
```

기대: 성공. `PageProps<"/admin/books/import">`는 Next가 라우트에서 생성하는 타입이라 **빌드를 한 번 돌린 뒤에** 해결된다 — 첫 실행에서 타입 오류가 나면 다시 돌려 본다.

- [ ] **Step 4: 실제로 한 권 가져와 본다**

```bash
npm run dev
```

`/admin/books/import`에서 다음을 넣는다 — 시드에 없는 만료작이어야 중복에 걸리지 않는다:

- 문서 주소: `https://ko.wikisource.org/wiki/빈처`
- 저자: `현진건`
- 카테고리: `소설`

기대:
1. 수 초 뒤 `/admin/books/{새 id}`로 이동한다.
2. 폼의 제목이 `빈처`, 저자가 `현진건`, 카테고리가 `소설`로 채워져 있다.
3. "본문과 표지" 섹션의 EPUB 상태가 `현재: 업로드됨 (다시 올리면 교체)`.
4. 소개·인용구·권리 근거는 비어 있다.

Supabase 대시보드에서 확인:

```sql
select title, author, category, source, source_ref, epub_path, file_size_mb
from public.books where source_ref = '빈처';
```

기대: 1행, `source='wikisource'`, `source_ref='빈처'`, `file_size_mb`가 0.1 미만(폰트를 걷어냈으므로).

- [ ] **Step 5: 실패 경로를 확인한다**

같은 화면에서 차례로:

| 입력 | 기대 배너 |
|---|---|
| 문서 주소 `https://ko.wikisource.org/wiki/없는문서제목입니다` · 저자 `아무개` · 카테고리 `소설` | "위키문헌에서 「없는문서제목입니다」 문서를 찾지 못했습니다. 주소를 확인해 주세요." |
| 문서 주소 `https://en.wikisource.org/wiki/Ulysses` | "한국 위키문헌(ko.wikisource.org) 주소만 가져올 수 있습니다 — 받은 주소: en.wikisource.org" |
| 문서 주소 `운수 좋은 날` · 저자 `현진건` · 카테고리 `소설` | 리다이렉트되어 **기존** 「운수 좋은 날」 수정 화면이 열린다 (중복 사전 확인) |
| 저자 `정지용` | "「정지용」은 등록할 수 없습니다 — 월북·납북 작가 — 사망 연도가 불확실합니다 (PRD §5.11 등록 금지 목록)." |

중복 케이스에서 **토스트가 아직 안 뜨는 게 정상이다** — Task 6에서 붙인다.

`빈처` 시험 데이터는 남겨 둔다 (Task 6에서 미완성 배지 확인에 쓴다).

- [ ] **Step 6: 커밋**

```bash
git add "src/app/admin/(dashboard)/books/import"
git commit -m "feat(admin): 위키문헌 문서를 받아 도서를 만든다

문서 주소·저자·카테고리만 받아 본문을 정리해 올리고 행을 만든 뒤 수정
화면으로 보낸다. 저자는 ws-export가 dc:creator를 넣지 않아 직접 입력받고,
등록 금지 저작자는 임포트 시점에 막는다."
```

---

## Task 6: 목록 진입점·미완성 배지·수정 화면 알림

임포트로 만든 도서는 소개와 권리 근거가 비어 있다. 그 상태가 목록에서 보이지 않으면 **게시물 도서 선택에 그대로 올라가** 소개 없는 도서가 발행된다. 그리고 지금 도서 수정 화면에는 알림 컴포넌트가 아예 없어서, 임포트 성공도 중복 안내도 조용히 지나간다.

**Files:**
- Modify: `src/app/admin/(dashboard)/books/page.tsx`
- Modify: `src/app/admin/(dashboard)/books/[bookId]/page.tsx`
- Modify: `src/components/admin/admin-toast.tsx`

**Interfaces:**
- Consumes: `books.intro`, `books.rights_note` · `?imported=1` / `?exists=1` (Task 5)
- Produces: 없음 (마지막 화면 작업)

- [ ] **Step 1: `AdminToast`가 새 쿼리 키를 알게 한다**

`src/components/admin/admin-toast.tsx`:

```ts
/** 서버 액션이 성공을 알릴 때 쓰는 쿼리 키들. 토스트를 띄운 뒤 지운다. */
const SUCCESS_KEYS = ["saved", "deleted", "done", "removed", "imported", "exists"];
```

- [ ] **Step 2: 목록에 진입점과 미완성 배지를 붙인다**

`src/app/admin/(dashboard)/books/page.tsx`의 select에 두 컬럼을 추가한다:

```ts
  const { data: books } = await db
    .from("books")
    .select("id, title, author, category, epub_path, isbn, cover_url, intro, rights_note")
    .order("title");
```

헤더의 버튼을 둘로 만든다:

```tsx
        <div className="flex gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/books/import">위키문헌에서 가져오기</Link>
          </Button>
          <Button asChild className="min-h-11">
            <Link href="/admin/books/new">새 도서</Link>
          </Button>
        </div>
```

유형 셀에 배지를 더한다:

```tsx
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {b.epub_path ? (
                      <Badge>전문</Badge>
                    ) : (
                      <Badge variant="secondary">링크형</Badge>
                    )}
                    {/*
                      임포트는 본문과 서지 최소값만 채운다. 소개는 도서 상세
                      시트의 첫 섹션이고 권리 근거는 공개 판단의 기록이라,
                      둘이 비어 있으면 발행 준비가 끝나지 않은 도서다.
                      표지·인용구는 없어도 정상이므로 판정에서 뺀다
                      (PRD §5.11, §5.12).
                    */}
                    {(!b.intro || !b.rights_note) && (
                      <Badge variant="outline">미완성</Badge>
                    )}
                  </div>
                </TableCell>
```

- [ ] **Step 3: 수정 화면에 알림을 붙인다**

`src/app/admin/(dashboard)/books/[bookId]/page.tsx`. import를 추가하고:

```tsx
import { AdminToast } from "@/components/admin/admin-toast";
```

컴포넌트 시그니처에 `searchParams`를 더하고 본문을 바꾼다:

```tsx
const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function EditBookPage({
  params,
  searchParams,
}: PageProps<"/admin/books/[bookId]">) {
  const { bookId } = await params;
  const sp = await searchParams;
  const db = await createClient();

  const { data: book } = await db
    .from("books")
    .select(
      "id, title, author, translator, publisher, category, isbn, page_count, pub_date_paper, pub_date_ebook, intro, quote, quote_source, toc, source, rights_note, epub_path, cover_url, purchase_links",
    )
    .eq("id", bookId)
    .maybeSingle();

  if (!book) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold break-keep">{book.title}</h1>
      <AdminToast
        message={
          q(sp.imported)
            ? "본문을 받았습니다. 소개·권리 근거를 채워 주세요."
            : q(sp.exists)
              ? "이미 등록된 위키문헌 문서입니다 — 기존 도서를 엽니다."
              : q(sp.saved)
                ? "저장했습니다."
                : undefined
        }
      />
      <BookForm book={book as BookFormValues} />
    </div>
  );
}
```

- [ ] **Step 4: 타입체크**

```bash
npm run build
```

기대: 성공.

- [ ] **Step 5: 375px 뷰포트에서 실제로 확인한다**

```bash
npm run dev
```

브라우저를 375px 폭으로 두고:

1. `/admin/books` — 헤더에 버튼 둘이 나오고 좁은 폭에서 겹치거나 잘리지 않는다. Task 5에서 넣은 「빈처」 행에 `전문` + `미완성` 배지가 함께 보인다. 시드 8권은 소개·권리 근거가 있으므로 `미완성`이 **없다**.
2. 「빈처」 수정 화면에서 소개를 채우고 저장 → 목록으로 돌아오면 `미완성`이 그대로다(권리 근거가 아직 비었다). 권리 근거까지 채우면 사라진다.
3. `/admin/books/import`에서 `운수 좋은 날`을 넣어 중복 경로를 태운다 → 기존 도서 수정 화면에서 "이미 등록된 위키문헌 문서입니다 — 기존 도서를 엽니다." 토스트가 3초 뜨고, **주소의 `?exists=1`이 사라진다**.
4. 새로고침한다 → 토스트가 다시 뜨지 않는다 (쿼리를 지웠으므로).

- [ ] **Step 6: 시험 데이터를 정리한다**

「빈처」는 시험용이고 **지운다** — 개발용 Supabase가 따로 없어 이 행은 운영 데이터다(Global Constraints). 남기면 게시물 없는 미완성 도서가 운영 DB에 상주한다.

**행과 스토리지 파일을 함께** 지운다 — 행만 지우면 비공개 버킷에 고아 EPUB이 남아 아무도 눈치채지 못한다.

1. 지우기 전에 id를 받아 둔다:

```sql
select id from public.books where source_ref = '빈처';
```

2. `/admin/books` 목록의 「빈처」 행에서 삭제 버튼(확인 팝오버를 거친다).
3. Supabase 대시보드 → Storage → `epubs` 버킷에서 `{1번에서 받은 id}.epub` 삭제.
4. 확인:

```sql
select count(*) from public.books where source_ref = '빈처';
```

기대: `0`.

- [ ] **Step 7: 커밋**

```bash
git add "src/app/admin/(dashboard)/books/page.tsx" "src/app/admin/(dashboard)/books/[bookId]/page.tsx" src/components/admin/admin-toast.tsx
git commit -m "feat(admin): 임포트 진입점·미완성 배지·수정 화면 알림

소개나 권리 근거가 빈 도서를 목록에서 구분한다 — 임포트가 채우지 않는
값이고, 안 보이면 소개 없는 도서가 게시물로 나간다."
```

---

## Task 7: 문서 갱신

규칙·스키마를 바꿨으면 같은 작업에서 문서를 맞춘다 (AGENTS.md 완료 기준). 문서와 코드가 어긋난 채 끝내지 않는다.

**Files:**
- Modify: `docs/prd-ttokttok.md`

**Interfaces:**
- Consumes: Task 1~6의 모든 결정
- Produces: 없음

- [ ] **Step 1: §5.10 어드민 CMS의 도서 관리 항목에 임포트를 적는다**

`- **도서 관리**:` 아래 `도서 등록/수정:` 줄 **다음**에 넣는다:

```markdown
  - **위키문헌 임포트** (`/admin/books/import`): 문서 주소(또는 제목)·저자·카테고리만 받아 EPUB을 수급·정리해 올리고 도서 행을 **바로 만든 뒤** 수정 화면으로 보낸다. 자동으로 채우는 값은 제목(`dc:title`)·본문·수급 출처뿐이다 — 저자는 ws-export가 `dc:creator`를 넣지 않아 원천이 없고, 소개·인용구·목차·권리 근거는 편집·법적 판단이라 기계가 채우지 않는다 (결정 기록 §11-48). 등록 금지 저작자(§5.11)는 임포트 시점에 거부한다. 소개나 권리 근거가 빈 도서는 목록에 `미완성` 배지로 표시된다.
```

- [ ] **Step 2: §5.11 콘텐츠 수급의 소스 표 아래에 라이선스 판단을 적는다**

`EPUB이 아닌 원본은 변환 후 어드민 업로드 (변환 스크립트는 `scripts/`).` 줄 **다음**에 넣는다:

```markdown
**위키문헌 EPUB의 정리와 라이선스 표시**

ws-export는 FreeSerif 4종(약 7.7MB)을 항상 임베드하고, 위키문헌 자신의 껍데기(로고가 박힌 표지 페이지, 기여자 목록 "About this digital edition", 본문 끝 「라이선스」 상자)를 함께 넣는다. 우리 판본의 첫 화면이 남의 로고일 수는 없고 폰트는 쓰이지도 않으므로(뷰어가 자체 CSS를 물린다) 받아온 뒤 걷어낸다 — `src/lib/wikisource.ts`.

다만 `content.opf`의 `dc:rights`(Creative Commons BY-SA 3.0 / GNU FDL)와 `dc:contributor`는 **남긴다.** 원문 자체는 만료 저작물이고 이 표기는 위키문헌 기여자의 편집·주석에 붙는 것이다. 화면에 보이지 않는 출처 기록이므로, 지우는 것은 표시 정리가 아니라 권리 표시를 떼는 별개의 판단이 된다 (결정 기록 §11-49).

정규식으로 XML을 다루는 처리라 위키문헌이 마크업을 바꾸면 조용히 헛돈다. 그래서 ① 업로드 직전 관문(`assertClean`)이 껍데기가 남았는지 확인하고 ② `src/lib/wikisource.test.ts`가 조립한 픽스처로 회귀를 잡는다.
```

- [ ] **Step 3: §6 데이터 모델의 books에 `source_ref`를 적는다**

§6의 `books`는 컬럼마다 `-- 주석`이 달린 코드 블록이다. `source` 줄 **바로 다음**에 한 줄을 끼우고 주석 열을 맞춘다:

```
  source text,                   -- 수급 출처 (gongu | wikisource | manual …)
  source_ref text,               -- 수급 원천 식별자. 위키문헌은 정규화한 문서 제목(퍼센트 디코드, 밑줄→공백). 부분 unique — 중복 수급 방지·재수급 추적
  rights_note text,              -- 권리 근거 (만료 판별·확보 경위 메모)
```

- [ ] **Step 4: §11 결정 기록에 네 항목을 더한다**

**§11은 `| 번호 | 라벨 | 내용 |` 표다.** 산문 본문의 교차 참조는 실제 표보다 뒤처져 있으니 **표를 직접 확인한다** — 이 번호는 계획 작성 이후 이미 42 → 47로 밀렸다:

```bash
awk '/^## 11\./,0' docs/prd-ttokttok.md | grep -oE "^\| [0-9]+ \|" | tail -1
```

2026-09-04 기준 마지막은 47이므로 새 항목은 **48부터**다. **다르면 실측값 다음 번호로 네 행을 쓰고, 이 파일 안의 `§11-48`~`§11-51` 교차 참조 8곳도 함께 맞추고 컨트롤러에게 보고한다.** 표의 마지막 행 다음에 네 행을 붙인다:

```markdown
| 48 | 위키문헌 임포트 | 문서 주소·저자·카테고리만 받아 행을 **바로 만들고** 수정 화면으로 보낸다. 폼 프리필 후 저장을 기다리는 방식도 가능했지만 받아온 EPUB 바이너리를 요청 사이에 들고 있어야 해 상태가 하나 늘어난다. `epub_path`가 있는 행은 books_needs_epub_or_store_ref를 이미 통과하므로 그 자체로 유효하다. 자동으로 채우는 건 제목(dc:title)·본문·수급 출처뿐 — ws-export는 `dc:creator`를 아예 넣지 않아(실측 확인) 저자의 원천이 없고, nav의 목차는 단편 하나를 한 줄로 주므로 편집자가 구성한 단편집 목차를 덮어쓴다. 대신 소개·권리 근거가 빈 도서를 목록에서 `미완성`으로 구분한다 — 안 보이면 소개 없는 도서가 게시물로 나간다. 자리표시자("미정")로 NOT NULL을 우회하지 않는다: 쓰레기 값이 남고 실수로 발행된다 |
| 49 | 위키문헌 껍데기 | 화면에 보이는 것(로고 표지 페이지·기여자 목록·「라이선스」 상자·위키백과 로고)은 우리 판본의 일부가 아니므로 제거하고, `content.opf`의 `dc:rights`(CC BY-SA 3.0 / GFDL)·`dc:contributor`는 **남긴다**. 전자는 표시 정리이고 후자를 지우는 건 권리 표시를 떼는 별개의 판단이다. 정규식으로 XML을 다루는 처리라 위키문헌이 마크업을 바꾸면 조용히 헛돈다 — 업로드 직전 관문(assertClean)과 조립 픽스처 테스트가 그걸 잡는다. 폰트 제거와 껍데기 제거는 원래 별개 함수로 4.4MB를 각각 통째로 압축 해제·재압축했는데, 서버리스 함수로 들어가면서 한 번의 왕복으로 합쳤다 |
| 50 | 수급 원천 기록 | `books.source_ref`에 **정규화한 문서 제목**을 남긴다(URL 아님). `source`에는 경로('wikisource')만 적혀 어느 문서에서 왔는지가 남지 않아 중복 임포트를 막을 수도, 원문 개정 시 재수급 대상을 찾을 수도 없었다 — 재수급 스크립트가 하드코딩 대응표(PAGE_OVERRIDES)를 들고 "DB에 담을 칸이 없어서 여기 적는다"고 주석까지 달아 둔 이유다. URL을 넣으면 퍼센트 인코딩·모바일 도메인 차이로 같은 문서가 서로 다른 문자열이 되어 부분 unique 인덱스가 중복을 놓친다. 임포트·시드·재수급이 전부 같은 정규화 함수(toPageTitle)를 거쳐야 성립한다 |
| 51 | 등록 금지 검사 위치 | 금지 저작자(§5.11) 검사는 **임포트 경로에만** 둔다. 위키문헌에 문서가 있다는 사실이 "공개해도 된다"로 오독되는 지점이 임포트이고, 위키문헌은 우리와 다른 기준으로 운영된다. 수동 등록은 막지 않는다 — 손으로 적어 넣는 행위에는 그 오독이 끼어들지 않는다. 이 비대칭은 의도한 것이고, 수동 경로는 검사 없이 남는다 |
```

- [ ] **Step 5: 문서와 코드가 어긋나지 않는지 확인한다**

읽으면서 대조한다:
- §5.10의 임포트 설명이 실제 폼의 3칸과 일치하는가
- §5.11의 `src/lib/wikisource.ts` 경로가 맞는가 (`scripts/lib/wikisource.mjs`가 아니다)
- §6의 `source_ref` 설명이 마이그레이션의 `comment on column`과 같은 말을 하는가
- §11-50가 말하는 "하드코딩 대응표"가 실제로 삭제됐는가 (`grep -r PAGE_OVERRIDES scripts/` → 결과 없음)

```bash
grep -rn "PAGE_OVERRIDES\|scripts/lib/wikisource" . --include="*.ts" --include="*.mjs" --include="*.md" --exclude-dir=node_modules --exclude-dir=.next
```

기대: `docs/superpowers/plans/`의 이 계획 문서 말고는 결과가 없다.

- [ ] **Step 6: 최종 검증**

```bash
npm test
npm run build
```

기대: 테스트 전부 PASS(기존 4개 파일 + `wikisource.test.ts` 20개), 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 위키문헌 임포트·source_ref·라이선스 판단 기록"
```

---

## 알려진 한계 — 이 계획이 풀지 않는 것

구현자가 "빠뜨렸나?" 하고 되돌아오지 않도록 적어 둔다. 전부 의도한 선택이다.

1. **장편은 타임아웃할 수 있다.** Vercel 함수 상한이 플랜에 묶여 있고(Hobby는 60초) `maxDuration`을 그보다 크게 쓰면 배포가 실패한다. 그래서 선언하지 않고 기본값에 맡긴다. 하위 페이지가 많은 장편이 실패하면 `npm run seed` 경로로 처리한다.
2. **수동 등록은 금지 저작자 검사를 받지 않는다** (§11-51).
3. **판본 괄호는 사람이 고쳐야 한다.** 「진달래꽃 (시집)」이 `books.title`에 그대로 들어가고, 잊으면 피드에 그렇게 나간다. `미완성` 배지는 이걸 잡지 못한다 — 제목은 채워져 있으므로.
4. **표지는 만들지 않는다.** PRD §5.11이 "표지가 없는 도서는 타이포그래피 폴백으로 렌더된다 — 임시방편이 아니라 상시 경로"라고 규정했다. `sharp`는 `package.json`에 없고(Next의 optional 의존으로 `node_modules`에 있을 뿐) 프로덕션 번들로 끌어들일 근거가 없다. 표지는 `npm run covers`가 따로 만든다.
5. **재수급(덮어쓰기) 버튼은 없다.** `npm run epubs:refresh`가 그 일을 하고, 어드민 화면으로 올리면 "덮어쓰면 기존 `epub_path`·`file_size_mb`는 어떻게 되나"가 통째로 열린다.
6. **`dc:rights` 판단은 법률 자문이 아니다.** 커밋 `4e168cc`의 코드 주석에 있던 판단을 승계해 PRD에 기록한 것이고, 검증된 법적 결론이 아니다.
