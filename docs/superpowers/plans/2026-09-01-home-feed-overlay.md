# 홈 피드 오버레이 계층 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 피드의 분할 레이아웃을 오버레이 계층으로 바꾼다 — 컨텐츠는 풀블리드가 되고, 액션 레일과 도서 정보 바는 그 위에 얹히는 레이어가 된다.

**Architecture:** `PostItem`의 세로/가로 flex 분할을 걷어내고 `absolute` 배치로 전환한다. 크롬(레일·도서 바)은 게시물 유형·테마와 무관하게 흰색 한 벌로 고정하고, 하단 검정 스크림과 글리프 그림자가 가독성을 담당한다. 크롬 색 상수는 새 모듈 `feed/chrome.ts` 한 곳에 모아 지금 두 파일에 복제된 클래스를 없앤다.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui · TypeScript

## Global Constraints

설계 근거와 모든 수치의 출처는 `docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md`다. 아래는 그 스펙에서 그대로 옮긴 값이며, 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **크롬은 한 벌이다.** 게시물 유형(카드/영상)과 테마(라이트/다크)에 따라 크롬의 색이 달라지면 안 된다.
- **스크림:** `linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)`, 높이 `160px`, 컨텐츠 영역 하단 고정.
- **크롬 색 (전부 고정값, 시맨틱 토큰 아님):**
  - 레일 아이콘·카운트·읽기 라벨·도서 제목: `#ffffff`
  - 장르·저자: `rgb(255 255 255 / 0.9)`
  - 읽기/도서 CTA: 배경 `#ffffff`, 아이콘 `#111111`
  - 미니 커버·채널 아바타: 배경 `rgb(0 0 0 / 0.28)`, 테두리 `rgb(255 255 255 / 0.5)`
- **그림자 (L2):**
  - 아이콘: `drop-shadow(0 0 1px rgb(0 0 0 / 0.65)) drop-shadow(0 1px 1px rgb(0 0 0 / 0.3))`
  - 텍스트: `text-shadow: 0 0 1px rgb(0 0 0 / 0.65), 0 1px 1px rgb(0 0 0 / 0.3)`
  - CTA 링: `box-shadow: 0 0 0 1px rgb(0 0 0 / 0.22), 0 1px 2px rgb(0 0 0 / 0.2)`
- **치수:** 레일 `right: 8px` · `bottom: 88px` / 도서 바 높이 `76px` · `padding: 0 12px` / 카드 본문 패딩 상 `20px` · 좌우 각 `60px` · 하 `84px`
- **z 스케일:** 본문 0 · 스크림 2 · 크롬 3 · `BottomNav` 50 (현행 유지)
- **터치 타깃** 44×44px 이상, 인접 타깃 간 8px 이상. **12px 미만 텍스트 금지** (`text-xs` = 12px가 하한).
- 한국어 제목류에는 `break-keep`을 유지한다.

## 이 저장소에는 테스트 러너가 없다

`package.json`에 `vitest`·`jest`·`playwright`가 **없다.** 완료 기준은 `docs/FRONTEND.md` §7이 정한다:

```bash
npm run build
```

빌드(타입체크 포함) 통과 + **375px 뷰포트에서 실제 렌더 확인**이다. 그래서 이 계획은 단위 테스트 대신 **DevTools 콘솔에 붙여넣는 측정 스니펫**으로 각 태스크를 검증한다. 눈대중이 아니라 통과/실패가 숫자로 나온다.

테스트 프레임워크를 새로 도입하지 않는다 — 이 작업의 범위가 아니다.

### 측정 준비 (모든 태스크 공통)

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 을 열고, DevTools를 375×812로 디바이스 에뮬레이션한 뒤 콘솔에 스니펫을 붙여넣는다. 라이트/다크는 프로필 화면의 테마 토글로 전환한다.

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/app/globals.css` | 그림자 유틸 2개 (`@layer utilities`) | 수정 |
| `src/components/feed/chrome.ts` | 피드 크롬 공통 클래스 상수 — 흰색 고정 예외 구역의 유일한 출처 | **신규** |
| `src/components/feed/book-cover.tsx` | 커버. `overlay` 변형 추가 | 수정 |
| `src/components/feed/like-button.tsx` | 좋아요. 복제된 클래스를 `chrome.ts`로 대체 | 수정 |
| `src/components/feed/action-bar.tsx` | 우측 레일. 복제된 클래스를 `chrome.ts`로 대체, CTA 흰 원 | 수정 |
| `src/components/feed/post-item.tsx` | 게시물 한 장. 분할 → 오버레이 + 스크림 + z 계층 | 수정 |
| `src/components/cards/template-card.tsx` | 카드 본문. 세이프존 패딩 | 수정 |
| `src/components/feed/video-player.tsx` | 영상. 풀블리드 + 음소거 버튼 위치 | 수정 |
| `docs/DESIGN.md` · `docs/prd-ttokttok.md` | 뒤집힌 결정 반영 | 수정 |

`chrome.ts`를 새로 만드는 이유: 지금 `action-bar.tsx`의 `ACTION_CLASS`와 `like-button.tsx`의 `BUTTON_CLASS`가 **같은 문자열을 복제**하고 있다. 크롬 색을 바꾸려면 두 곳을 고쳐야 하고, 한 곳을 놓치면 레일 안에서 색이 갈린다. `action-bar.ts`가 `like-button`을 import하므로 거기에 두면 순환 참조가 되어 별도 모듈로 뺀다.

---

## 중간 상태에 대한 안내

Task 2가 끝난 시점에는 **라이트 테마 피드에서 레일이 잘 안 보인다.** 크롬이 흰색이 됐는데 스크림은 Task 3에서 들어오기 때문이다. 의도된 중간 상태이고 Task 3에서 해소된다. Task 2만 보고 되돌리지 말 것.

---

### Task 1: 그림자 유틸 + 커버 오버레이 변형

시각 변화 없음 — 새 코드는 아직 아무도 쓰지 않는다. 다음 태스크들이 쓸 재료를 만든다.

**Files:**
- Modify: `src/app/globals.css` (파일 끝 `@layer base` 블록 뒤)
- Modify: `src/components/feed/book-cover.tsx`

**Interfaces:**
- Consumes: 없음
- Produces:
  - CSS 유틸 클래스 `.feed-chrome-icon`, `.feed-chrome-text`
  - `BookCover` prop 시그니처: `{ book: FeedBook; className?: string; overlay?: boolean }` — `overlay`는 기본 `false`

- [ ] **Step 1: 그림자 유틸을 추가한다**

`src/app/globals.css` 맨 끝, 기존 `@layer base { ... }` 블록 **뒤**에 붙인다:

```css

@layer utilities {
  /* 피드 크롬 전용 — 콘텐츠 위 가독성 확보용이다.
     DESIGN.md "그림자를 쓰지 않는다"의 예외이며, 목적이 다르다:
     깊이 표현이 아니라 밝은 카드 위에서 흰 글리프의 경계를 세운다.
     1px 밀착 윤곽이 가독성을 만들고 짧은 낙차가 떠 있음을 표현한다.
     넓은 헤일로는 번짐만 만들어서 쓰지 않는다 (설계 문서 "그림자(L2)"). */
  .feed-chrome-icon {
    filter: drop-shadow(0 0 1px rgb(0 0 0 / 0.65))
      drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
  }

  .feed-chrome-text {
    text-shadow:
      0 0 1px rgb(0 0 0 / 0.65),
      0 1px 1px rgb(0 0 0 / 0.3);
  }
}
```

- [ ] **Step 2: `BookCover`에 `overlay` 변형을 추가한다**

`src/components/feed/book-cover.tsx` 전체를 아래로 교체한다:

```tsx
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { FeedBook } from "@/lib/feed";

/**
 * 도서 커버. cover_url이 없으면 타이포그래피 폴백으로 그린다.
 *
 * 폴백은 임시방편이 아니라 상시 경로다 — 저작권 만료작처럼 표지 이미지가
 * 존재하지 않는 도서가 계속 들어온다.
 *
 * overlay는 피드 크롬 안에서 쓸 때다 (하단 도서 정보 바). 기본 폴백은
 * bg-card + text-card-foreground라 밝은 카드 위에 얹으면 흰 배경에 흰
 * 글씨가 되어 사라진다. 그래서 어두운 반투명 면과 흰 글씨로 뒤집는다.
 *
 * 어느 쪽이든 aspect-[2/3]로 공간을 먼저 예약해 레이아웃 시프트를 막는다.
 */
export function BookCover({
  book,
  className,
  overlay = false,
}: {
  book: FeedBook;
  className?: string;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-sm border",
        overlay
          ? "border-white/50 bg-black/[0.28]"
          : "bg-card border-border",
        className,
      )}
    >
      {book.cover_url ? (
        <Image
          src={book.cover_url}
          alt={`${book.title} 표지`}
          fill
          sizes="(max-width: 480px) 40vw, 200px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
          <span
            className={cn(
              "text-sm leading-snug font-bold break-keep",
              overlay && "feed-chrome-text text-white",
            )}
          >
            {book.title}
          </span>
          <span
            className={cn(
              "text-xs",
              overlay
                ? "feed-chrome-text text-white/90"
                : "text-muted-foreground",
            )}
          >
            {book.author}
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 빌드가 통과하는지 확인한다**

Run: `npm run build`
Expected: 성공. `overlay`는 선택 prop이고 기본값이 `false`라 기존 호출부(4곳: `post-item.tsx`, `regions.tsx` 2곳, `discover/book-grid.tsx` 등)는 타입 오류 없이 그대로 컴파일된다.

- [ ] **Step 4: 유틸이 실제로 방출됐는지 확인한다**

`npm run dev` 실행 후 브라우저 콘솔에 붙여넣는다:

```js
const el = document.createElement('div');
el.className = 'feed-chrome-icon feed-chrome-text';
document.body.append(el);
const cs = getComputedStyle(el);
console.log({ filter: cs.filter, textShadow: cs.textShadow });
el.remove();
```

Expected: `filter`가 `drop-shadow(...)` 두 개를 포함하고, `textShadow`가 `none`이 아니다.
둘 중 하나라도 `none`이면 Tailwind가 유틸을 못 찾은 것이다 — `@layer utilities` 블록이 `@layer base` **뒤**에 있는지, `globals.css`가 저장됐는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/app/globals.css src/components/feed/book-cover.tsx
git commit -m "feat(feed): 크롬 그림자 유틸과 커버 오버레이 변형 추가"
```

---

### Task 2: 크롬 색을 흰색으로 고정하고 복제된 클래스를 합친다

**중간 상태 주의:** 이 태스크가 끝나면 라이트 테마에서 레일이 잘 안 보인다. 스크림이 Task 3에서 들어오기 때문이다. 정상이다.

**Files:**
- Create: `src/components/feed/chrome.ts`
- Modify: `src/components/feed/like-button.tsx`
- Modify: `src/components/feed/action-bar.tsx`

**Interfaces:**
- Consumes: Task 1의 `.feed-chrome-icon`, `.feed-chrome-text`
- Produces: `chrome.ts`가 내보내는 상수 5개 —
  `CHROME_ACTION: string`, `CHROME_ICON: string`, `CHROME_COUNT: string`,
  `CHROME_CTA: string`, `CHROME_CTA_ICON: string`

- [ ] **Step 1: 크롬 공통 클래스 모듈을 만든다**

Create `src/components/feed/chrome.ts`:

```ts
import { cn } from "@/lib/utils";

/**
 * 피드 크롬의 공통 클래스.
 * 설계: docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md
 *
 * 크롬은 게시물 유형·테마와 무관하게 한 벌이다 — 흰색 고정. 시맨틱 토큰을
 * 쓰지 않는 예외 구역이고(DESIGN.md Colors), 그 범위는 이 파일을 import하는
 * 피드 컴포넌트로 한정한다. 다른 화면에서 쓰지 말 것.
 *
 * 여기 모으는 이유: 예전에는 같은 문자열이 action-bar와 like-button에
 * 복제돼 있었다. 한 곳만 고치면 레일 안에서 색이 갈린다.
 * action-bar가 like-button을 import하므로 순환을 피해 별도 모듈로 둔다.
 */

/** 레일 액션 버튼 (좋아요·댓글·공유) 공통 껍데기. 44×44 터치 타깃을 보장한다. */
export const CHROME_ACTION = cn(
  "focus-visible:ring-ring flex min-h-11 min-w-11 flex-col items-center",
  "justify-center gap-1 rounded-md text-white",
  "focus-visible:ring-2 focus-visible:outline-none",
);

/** 레일 아이콘. 그림자가 밝은 배경에서 글리프 경계를 세운다. */
export const CHROME_ICON = "feed-chrome-icon size-6";

/** 카운트 숫자. text-xs = 12px로 하한을 지킨다. */
export const CHROME_COUNT = "feed-chrome-text text-xs tabular-nums";

/**
 * CTA 껍데기. "읽기"와 "도서"는 생김새가 같아야 한다 — 도서 유형이 달라도
 * 그룹 안에서 같은 위계로 읽혀야 하기 때문 (PRD §11-31).
 */
export const CHROME_CTA = cn(
  "focus-visible:ring-ring flex flex-col items-center gap-1 rounded-md",
  "text-white focus-visible:ring-2 focus-visible:outline-none",
);

/**
 * CTA 원형. 크롬 중 유일하게 색이 반전된다 — 흰 면에 어두운 아이콘.
 * 위계 최상을 지키기 위해서다. 흰 카드 위에서 면이 묻히므로 링으로
 * 가장자리를 세운다 (설계 문서 "그림자(L2)").
 */
export const CHROME_CTA_ICON = cn(
  "flex size-11 items-center justify-center rounded-full",
  "bg-white text-[#111111] transition-opacity hover:opacity-90",
  "shadow-[0_0_0_1px_rgb(0_0_0/0.22),0_1px_2px_rgb(0_0_0/0.2)]",
);
```

- [ ] **Step 2: `LikeButton`을 공통 클래스로 바꾼다**

`src/components/feed/like-button.tsx`에서 아래 4곳을 고친다.

① import에 추가 (`cn` import 줄 아래):

```ts
import { CHROME_ACTION, CHROME_COUNT, CHROME_ICON } from "@/components/feed/chrome";
```

② 파일 상단의 `BUTTON_CLASS` 상수 선언을 **삭제**한다:

```ts
// 삭제할 것 ↓
const BUTTON_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";
```

③ 게스트 분기의 버튼을 교체한다:

```tsx
  if (isGuest) {
    return (
      <LoginSheet reason="로그인하면 좋아요를 누를 수 있어요.">
        <button type="button" aria-label="좋아요" className={CHROME_ACTION}>
          <Heart className={CHROME_ICON} aria-hidden />
          <span className={CHROME_COUNT}>{formatCount(count)}</span>
        </button>
      </LoginSheet>
    );
  }
```

④ 로그인 사용자 분기의 return을 교체한다:

```tsx
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="좋아요"
      aria-pressed={optimistic.liked}
      className={CHROME_ACTION}
    >
      {/* 채움만으로 상태를 말한다 — 빨간 하트는 관례지만 이 디자인
          시스템에서 유채색은 도서 표지의 몫이다 (DESIGN.md Colors).
          크롬은 흰색 고정이므로 채움도 흰색이다. */}
      <Heart
        className={cn(CHROME_ICON, optimistic.liked && "fill-current")}
        aria-hidden
      />
      <span className={CHROME_COUNT}>{formatCount(optimistic.count)}</span>
    </button>
  );
```

`text-foreground`가 사라진 점이 중요하다 — 그건 테마를 따르는 토큰이라 오버레이에서는 틀린 색이다.

- [ ] **Step 3: `ActionBar`를 공통 클래스로 바꾼다**

`src/components/feed/action-bar.tsx`에서:

① import에 추가:

```ts
import {
  CHROME_ACTION,
  CHROME_COUNT,
  CHROME_CTA,
  CHROME_CTA_ICON,
  CHROME_ICON,
} from "@/components/feed/chrome";
```

② 파일 상단의 `ACTION_CLASS` 상수 선언을 **삭제**한다:

```ts
// 삭제할 것 ↓
const ACTION_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";
```

③ 파일 **하단**의 `CTA_CLASS`와 `CTA_ICON_CLASS` 상수 선언 두 개를 **삭제**한다 (주석 포함 — 같은 설명이 `chrome.ts`로 옮겨갔다).

④ `commentButton`을 교체한다:

```tsx
  const commentButton = (
    <button type="button" aria-label="댓글" className={CHROME_ACTION}>
      <MessageCircle className={CHROME_ICON} aria-hidden />
      <span className={CHROME_COUNT}>{formatCount(post.comment_count)}</span>
    </button>
  );
```

⑤ 공유 버튼을 교체한다:

```tsx
      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className={CHROME_ACTION}
      >
        <Share2 className={CHROME_ICON} aria-hidden />
        <span className={CHROME_COUNT}>{formatCount(shareCount)}</span>
      </button>
```

⑥ CTA 두 갈래에서 `CTA_CLASS` → `CHROME_CTA`, `CTA_ICON_CLASS` → `CHROME_CTA_ICON`, 라벨 `text-xs` → `CHROME_COUNT`로 바꾼다:

```tsx
      {/* 전문 도서는 뷰어로 직행, 링크형은 도서 상세 시트로 (PRD §11-31) */}
      {post.books.epub_path !== null ? (
        <Link
          href={`/read/${post.books.id}`}
          aria-label={`${post.books.title} 바로 읽기`}
          className={CHROME_CTA}
        >
          <span className={CHROME_CTA_ICON}>
            <BookOpen className="size-5" aria-hidden />
          </span>
          <span className={CHROME_COUNT}>읽기</span>
        </Link>
      ) : (
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보 보기`}
            className={CHROME_CTA}
          >
            <span className={CHROME_CTA_ICON}>
              <Info className="size-5" aria-hidden />
            </span>
            <span className={CHROME_COUNT}>도서</span>
          </button>
        </BookSheet>
      )}
```

- [ ] **Step 4: 미사용이 된 import를 지운다**

`action-bar.tsx`는 `cn`을 `CTA_CLASS`·`CTA_ICON_CLASS`에서만 썼다. 둘을 지웠으므로 **`cn` import도 지운다:**

```ts
// 삭제할 것 ↓
import { cn } from "@/lib/utils";
```

`like-button.tsx`의 `cn`은 `Heart`의 `className`에서 계속 쓰이므로 **남긴다.**

- [ ] **Step 5: 빌드와 린트를 확인한다**

Run: `npm run build`
Expected: 성공.

Run: `npm run lint`
Expected: 새 경고 없음. `no-unused-vars`가 뜨면 위 Step 4를 빠뜨린 것이다.

- [ ] **Step 6: 크롬이 테마와 무관하게 흰색인지 측정한다**

`npm run dev` 후, 라이트 테마에서 콘솔에 붙여넣는다:

```js
const rail = document.querySelector('[data-post-id] a[aria-label*="읽기"], [data-post-id] button[aria-label="공유"]')
  .closest('div');
const colors = [...rail.querySelectorAll('button, a, span')]
  .map(el => getComputedStyle(el).color)
  .filter(c => c !== 'rgba(0, 0, 0, 0)');
console.log('고유 색:', [...new Set(colors)]);
```

Expected: `rgb(255, 255, 255)`와 CTA 아이콘의 `rgb(17, 17, 17)`만 나온다.
`oklch(...)`가 섞여 있으면 토큰 클래스가 남아 있는 것이다 — 그 요소를 찾아 `chrome.ts` 상수로 바꾼다.

다크 테마로 전환해 같은 스니펫을 다시 돌린다. **결과가 같아야 한다.**

- [ ] **Step 7: 커밋**

```bash
git add src/components/feed/chrome.ts src/components/feed/like-button.tsx src/components/feed/action-bar.tsx
git commit -m "refactor(feed): 크롬 색을 흰색으로 고정하고 복제된 클래스를 chrome.ts로 합침"
```

---

### Task 3: `PostItem`을 오버레이로 전환하고 카드 세이프존을 준다

이 태스크가 끝나면 피드가 완성형이 된다. 스크림이 들어오면서 Task 2의 중간 상태가 해소된다.

**Files:**
- Modify: `src/components/feed/post-item.tsx`
- Modify: `src/components/cards/template-card.tsx`

**Interfaces:**
- Consumes: Task 1의 `BookCover` `overlay` prop과 `.feed-chrome-text`, Task 2의 흰색 크롬
- Produces: `PostItem`의 DOM 계약 — `article[data-post-id]`가 `relative`이고, 그 안에 본문(z-0) / 스크림(z-2) / 크롬(z-3)이 형제로 놓인다. `FeedScroller`의 `data-post-id` 조회와 스냅 스크롤은 그대로 동작한다.

- [ ] **Step 1: `PostItem`을 오버레이 구조로 교체한다**

`src/components/feed/post-item.tsx` 전체를 아래로 교체한다:

```tsx
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TemplateCard } from "@/components/cards/template-card";
import { ActionBar } from "@/components/feed/action-bar";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { VideoPlayer } from "@/components/feed/video-player";
import type { FeedPost } from "@/lib/feed";

/**
 * 피드의 게시물 한 개. 뷰포트 높이를 꽉 채우고 스냅된다.
 *
 * 레이아웃은 분할이 아니라 오버레이다 (설계:
 * docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md).
 * 홈의 구조적 형제는 하단 액션 바와 컨텐츠 영역 둘뿐이고, 액션 레일과
 * 도서 정보 바는 컨텐츠 위에 얹히는 레이어다.
 *
 * z 계층: 본문 0 → 스크림 2 → 크롬 3 → BottomNav 50.
 *
 * 크롬은 게시물 유형·테마와 무관하게 흰색 한 벌이다. 밑에 깔린 것이
 * 우리 표면이든 남의 픽셀이든 같은 처방을 쓴다 — 인스타·유튜브·틱톡
 * 실측에서 확인한 규칙이다 (설계 문서 "선례 조사").
 *
 * preview는 어드민 미리보기 전용이다 (PRD §5.10). 미리보기가 이 컴포넌트를
 * 그대로 쓰는 덕분에 "관리자가 본 화면"과 "사용자가 볼 화면"이 어긋날 수
 * 없다 — 마크업도 클래스도 한 벌뿐이다. 어드민은 라이트 고정이라
 * 가장 불리한 조건이 항상 노출된다.
 */
export function PostItem({
  post,
  liked = false,
  isGuest = true,
  userId = null,
  preview,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
  preview?: boolean;
}) {
  const byline = [
    post.books.author,
    post.books.translator ? `${post.books.translator} 옮김` : null,
    post.books.publisher,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      data-post-id={post.id}
      className="relative h-full snap-start snap-always overflow-hidden"
    >
      {/* z-0 — 본문. 풀블리드로 컨텐츠 영역을 꽉 채운다. */}
      <div className="absolute inset-0">
        {post.type === "video" ? (
          post.post_videos ? (
            <VideoPlayer video={post.post_videos} poster={post.books.cover_url} />
          ) : (
            // 영상 레코드가 없는 영상 게시물 — 빈 화면 대신 도서를 보여준다.
            <div className="flex h-full items-center justify-center px-6">
              <BookCover book={post.books} className="w-32" />
            </div>
          )
        ) : (
          <TemplateCard
            layout={post.post_cards}
            book={post.books}
            preview={preview}
          />
        )}
      </div>

      {/*
        z-2 — 스크림. 검정 고정이라 테마를 면제받는다.
        Tailwind 그라디언트 클래스 대신 인라인 스타일을 쓰는 이유: 이 값은
        설계 문서가 정한 정확한 값이고, 클래스로 옮기면 v3/v4 이름 차이
        (bg-gradient-to-t vs bg-linear-to-t)에 휘둘린다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-40"
        style={{ background: "linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)" }}
      />

      {/* z-3 — 우측 세로 액션 레일 */}
      <div className="absolute right-2 bottom-[88px] z-[3]">
        <ActionBar post={post} liked={liked} isGuest={isGuest} userId={userId} />
      </div>

      {/* z-3 — 하단 도서 정보 바.
          아바타는 채널로, 도서 정보는 상세 시트로 — 목적지가 다르므로
          하나의 링크로 묶지 않는다 (PRD §5.1). 채널 아바타는 오른쪽에
          따로 두고 44px 터치 타깃을 지킨다. 경계선은 쓰지 않는다 —
          층은 스크림이 만든다. */}
      <footer className="absolute inset-x-0 bottom-0 z-[3] flex h-[76px] items-center gap-3 px-3">
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보`}
            className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <BookCover book={post.books} overlay className="w-10 shrink-0" />

            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="feed-chrome-text truncate text-xs text-white/90">
                {post.books.category}
              </span>
              <span className="feed-chrome-text truncate text-sm font-medium text-white break-keep">
                {post.books.title}
              </span>
              <span className="feed-chrome-text truncate text-xs text-white/90">
                {byline}
              </span>
            </span>
          </button>
        </BookSheet>

        <Link
          href={`/channel/${post.channels.slug}`}
          aria-label={`${post.channels.name} 채널`}
          className="focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <Avatar className="size-8 border border-white/50 bg-black/[0.28]">
            {post.channels.avatar_url ? (
              <AvatarImage src={post.channels.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="feed-chrome-text bg-transparent text-xs text-white">
              {post.channels.name.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
        </Link>
      </footer>
    </article>
  );
}
```

- [ ] **Step 2: `TemplateCard`에 세이프존 패딩을 준다**

`src/components/cards/template-card.tsx`에서 return의 바깥 `div` 클래스만 바꾼다.

교체 전:

```tsx
    <div className="flex h-full min-h-0 flex-col justify-center gap-4 px-6 py-8">
```

교체 후:

```tsx
    // 세이프존: 분할이 만들던 여백을 이제 패딩이 만든다.
    // 좌우 각 60px = 레일 우측 여백 8 + 레일 폭 44 + 여유 8.
    // 좌우가 대칭이라야 중앙정렬 콘텐츠가 프레임 중심에서 안 밀린다.
    // 하단 84px = 도서 정보 바 76 + 여유 8.
    <div className="flex h-full min-h-0 flex-col justify-center gap-4 px-15 pt-5 pb-21">
```

`px-15` = 60px, `pt-5` = 20px, `pb-21` = 84px (Tailwind v4의 동적 spacing 스케일: 값 × 4px).

- [ ] **Step 3: 빌드를 확인한다**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 겹침·정렬·터치 타깃을 측정한다**

`npm run dev` 후 375×812 에뮬레이션, **카드 게시물**이 보이는 상태에서 콘솔에 붙여넣는다:

```js
const R = el => { const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right),
           b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
const hit = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);

const post = document.querySelector('article[data-post-id]');
const rail = post.querySelector('.absolute.right-2');
const bar = post.querySelector('footer');
const body = post.querySelector('.absolute.inset-0 > div');

const texts = [...body.children].map(R);
const taps = [...post.querySelectorAll('footer a, footer button, [class*="right-2"] a, [class*="right-2"] button')].map(R);
const small = [...post.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && el.innerText?.trim() &&
  parseFloat(getComputedStyle(el).fontSize) < 12);

const cs = getComputedStyle(body);
const center = (R(body).x + parseFloat(cs.paddingLeft) + R(body).r - parseFloat(cs.paddingRight)) / 2;

console.table({
  '본문↔레일 겹침': texts.some(t => hit(t, R(rail))),
  '본문↔도서바 겹침': texts.some(t => hit(t, R(bar))),
  '중앙 어긋남(px)': Math.round(center - (R(post).x + R(post).w / 2)),
  '최소 터치타깃(px)': Math.min(...taps.map(t => Math.min(t.w, t.h))),
  '12px 미만 텍스트': small.length,
});
```

Expected:
| 항목 | 값 |
|---|---|
| 본문↔레일 겹침 | `false` |
| 본문↔도서바 겹침 | `false` |
| 중앙 어긋남(px) | `0` |
| 최소 터치타깃(px) | `44` 이상 |
| 12px 미만 텍스트 | `0` |

겹침이 `true`면 `template-card.tsx`의 `px-15` / `pb-21`을 키운다. 중앙 어긋남이 0이 아니면 좌우 패딩이 비대칭인 것이다.

- [ ] **Step 5: 스냅 스크롤이 안 깨졌는지 확인한다**

같은 화면에서 위아래로 스와이프한다. 게시물 하나 단위로 딱 멈춰야 한다.

```js
const c = document.querySelector('article[data-post-id]').parentElement;
console.log({
  스냅타입: getComputedStyle(c).scrollSnapType,
  게시물높이: document.querySelector('article[data-post-id]').getBoundingClientRect().height,
  컨테이너높이: c.clientHeight,
});
```

Expected: `스냅타입`이 `none`이 아니고, 게시물 높이와 컨테이너 높이가 같다.

- [ ] **Step 6: 라이트/다크에서 크롬이 동일한지 확인한다**

프로필에서 테마를 전환하며 각각 실행한다:

```js
const bar = document.querySelector('article[data-post-id] footer');
console.log(getComputedStyle(bar.querySelector('.font-medium')).color);
```

Expected: 두 테마 모두 `rgb(255, 255, 255)`.

- [ ] **Step 7: 커밋**

```bash
git add src/components/feed/post-item.tsx src/components/cards/template-card.tsx
git commit -m "feat(feed): 게시물 레이아웃을 분할에서 오버레이 계층으로 전환"
```

---

### Task 4: 영상 게시물을 풀블리드로 만든다

**Files:**
- Modify: `src/components/feed/video-player.tsx`

**Interfaces:**
- Consumes: Task 3의 `PostItem` 오버레이 구조 (본문이 `absolute inset-0`을 채운다)
- Produces: 없음 — `VideoPlayer`의 props 시그니처는 그대로다

- [ ] **Step 1: `object-contain`을 `object-cover`로 바꾼다**

`src/components/feed/video-player.tsx`에서 `<video>`의 className을 바꾼다.

교체 전:

```tsx
            className="h-full w-full object-contain"
```

교체 후:

```tsx
            // 풀블리드다 — 분할된 상자에 맞추려던 레터박스가 더는 필요 없다.
            className="h-full w-full object-cover"
```

- [ ] **Step 2: 음소거 버튼을 레일과 같은 우측 열에 맞춘다**

교체 전:

```tsx
            className="focus-visible:ring-ring absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:outline-none"
```

교체 후:

```tsx
            // 상단에는 스크림이 없다. 크롬 중 유일하게 자기 배경을 갖는
            // 요소이고, 그림자만으로는 밝은 영상 프레임에서 부족하다.
            className="focus-visible:ring-ring absolute top-3.5 right-3.5 z-[3] flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:outline-none"
```

`top-3.5 right-3.5` = 14px.

- [ ] **Step 3: 빌드를 확인한다**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 영상이 화면을 채우고 크롬이 라이트/다크에서 같은지 측정한다**

영상 게시물이 보이는 상태에서:

```js
const post = document.querySelector('article[data-post-id]');
const v = post.querySelector('video');
const mute = post.querySelector('button[aria-label*="소리"]');
console.table({
  'object-fit': v ? getComputedStyle(v).objectFit : '(유튜브 iframe)',
  '영상이 화면을 채움': v ? Math.round(v.getBoundingClientRect().height) === Math.round(post.getBoundingClientRect().height) : '해당 없음',
  '음소거 버튼 z': mute ? getComputedStyle(mute).zIndex : '없음',
  '음소거 크기': mute ? Math.round(mute.getBoundingClientRect().width) : '없음',
});
```

Expected: `object-fit`이 `cover`, 영상 높이가 게시물 높이와 같고, 음소거 버튼이 44px에 `z-index: 3`.

테마를 전환해도 영상 프레임의 크롬 색이 변하지 않아야 한다 — `BottomNav`만 바뀐다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/feed/video-player.tsx
git commit -m "feat(feed): 영상 게시물을 풀블리드로 전환하고 음소거 버튼 정렬"
```

---

### Task 5: 뒤집힌 결정을 문서에 반영한다

코드만 고치면 문서가 정반대를 말하는 상태가 된다. `docs/FRONTEND.md` §7이 "토큰·템플릿·상태 규칙을 바꿨다면 같은 커밋에서 문서를 갱신한다"고 요구한다.

**Files:**
- Modify: `docs/prd-ttokttok.md` (§5.1 본문 91~96행 부근, 결정 기록 §11-27 표 행)
- Modify: `docs/DESIGN.md` (Colors 사용 규칙 / Elevation & Depth / Layout)

**Interfaces:**
- Consumes: Task 1~4에서 확정된 실제 값
- Produces: 없음 (문서만)

- [ ] **Step 1: PRD §5.1의 분할 레이아웃 블록을 다시 쓴다**

`docs/prd-ttokttok.md`에서 `- **공통 UI — 분할 레이아웃** (오버레이 아님, 결정 기록 §11-27):` 로 시작하는 블록 전체를 아래로 교체한다. 하위 항목(우측 세로 액션 바 설명, CTA 이원화, 하단 바 설명)은 **유지하되** 첫 줄과 마지막 줄만 바꾼다:

```markdown
- **공통 UI — 오버레이 계층** (결정 기록 §11-27, 설계 `docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md`):
```

그리고 같은 블록의 마지막 줄을 교체한다.

교체 전:

```markdown
  - 카드는 텍스트 위주라 UI를 겹치면 읽기를 방해한다 — 영상 게시물(§5.3)이 들어오는 시점에 오버레이 재검토.
```

교체 후:

```markdown
  - 컨텐츠는 풀블리드이고 크롬이 그 위에 얹힌다. 크롬은 게시물 유형·테마와 무관하게 흰색 한 벌이며, 하단 검정 스크림 `rgb(0 0 0 / 0.55)` 160px와 글리프 그림자가 가독성을 담당한다. 카드 본문은 좌우 각 60px·하단 84px 세이프존으로 크롬을 피한다.
```

- [ ] **Step 2: 결정 기록 §11-27을 갱신한다**

같은 파일의 결정 기록 표에서 27번 행을 교체한다.

교체 전:

```markdown
| 27 | 피드 게시물 레이아웃 | 분할(카드 영역 + 하단 정보 바). "읽기" CTA는 우측 액션 바 그룹의 마지막 자리에 채워진 원형으로 — 텍스트 카드에 UI를 겹치지 않기 위함. 영상 도입 시 오버레이 재검토 |
```

교체 후:

```markdown
| 27 | 피드 게시물 레이아웃 | **오버레이**(2026-09-01 개정). 홈의 구조적 형제는 하단 액션 바와 컨텐츠 영역 둘뿐이고, 액션 레일·도서 정보 바는 컨텐츠 위 레이어다. 원래 분할을 택한 이유("텍스트 카드에 UI를 겹치지 않기 위함")와 함께 적어둔 "영상 도입 시 오버레이 재검토"를 실행한 결과다. 크롬은 유형·테마 무관 한 벌 |
```

- [ ] **Step 3: DESIGN.md의 피드 오버레이 색 규칙을 갱신한다**

`docs/DESIGN.md` Colors 절의 사용 규칙에서 해당 줄을 교체한다.

교체 전:

```markdown
- 피드 오버레이(영상·커버 위 텍스트)는 예외적으로 `text-white` + 그라디언트 스크림(`from-black/60`)을 쓴다 — 콘텐츠 위 가독성은 테마와 무관하게 항상 어두운 배경을 전제하기 때문. 이 예외는 피드 오버레이 컴포넌트 안에만 존재해야 한다.
```

교체 후:

```markdown
- **피드 크롬은 테마 면제 구역이다.** 액션 레일과 도서 정보 바는 게시물 유형·테마와 무관하게 흰색 고정(`#ffffff`, 보조 텍스트 `rgb(255 255 255 / 0.9)`)이고, 컨텐츠 영역 하단의 검정 스크림 `linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)` 160px가 대비를 만든다. 시맨틱 토큰을 쓰지 않는 유일한 예외이며, 범위는 `src/components/feed/chrome.ts`를 import하는 컴포넌트로 한정한다. 근거와 실측은 `docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md`.
```

- [ ] **Step 4: DESIGN.md의 그림자 규칙에 예외를 추가한다**

Elevation & Depth 절에서 `그림자를 쓰지 않는다.` 로 시작하는 문단 **바로 아래**에 한 줄 추가한다:

```markdown
> 예외: 피드 크롬의 **콘텐츠 위 가독성** 확보에 한해 그림자를 쓴다. 깊이 표현이 아니라 밝은 카드 위에서 흰 글리프의 경계를 세우는 용도다. 유틸은 `globals.css`의 `.feed-chrome-icon` / `.feed-chrome-text` 두 개뿐이고, 그 밖의 그림자는 여전히 금지다.
```

- [ ] **Step 5: DESIGN.md Layout에 세이프존과 z 스케일을 추가한다**

Layout 절의 `- **피드는 예외 레이아웃**:` 항목 **바로 아래**에 두 줄 추가한다:

```markdown
- **피드 세이프존**: 크롬이 컨텐츠 위에 얹히므로 카드 본문이 스스로 피한다 — 좌우 각 60px(레일 우측 여백 8 + 레일 폭 44 + 여유 8), 하단 84px(도서 정보 바 76 + 여유 8). **좌우는 반드시 대칭**이라야 중앙정렬 콘텐츠가 프레임 중심에서 밀리지 않는다.
- **z 스케일**: 본문 0 → 스크림 2 → 크롬 3 → `BottomNav` 50 → 시트·모달(Radix portal). 새 오버레이는 이 스케일 안에 배치한다.
```

- [ ] **Step 6: 코드 주석이 문서와 어긋나지 않는지 확인한다**

Run: `grep -rn "오버레이가 아니라 분할\|분할 레이아웃" src/ docs/`
Expected: 결과 없음. 남아 있으면 그 자리를 오버레이 설명으로 고친다 (Task 3에서 `post-item.tsx` 주석은 이미 교체했다).

- [ ] **Step 7: 커밋**

```bash
git add docs/prd-ttokttok.md docs/DESIGN.md
git commit -m "docs: 피드 레이아웃 결정을 분할에서 오버레이로 갱신"
```

---

## 최종 검증 (전체 태스크 완료 후)

스펙의 "검증 기준" 9개를 한 번에 확인한다. `npm run dev` 후 375×812에서 **카드 게시물**과 **영상 게시물** 각각, **라이트**와 **다크** 각각 — 총 4조합을 돈다.

```js
const R = el => { const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right),
           b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
const hit = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);

const post = document.querySelector('article[data-post-id]');
const rail = post.querySelector('[class*="right-2"]');
const bar = post.querySelector('footer');
const body = post.querySelector('.absolute.inset-0 > div');
const taps = [...post.querySelectorAll('a, button')].map(R);
const small = [...post.querySelectorAll('*')].filter(el =>
  el.children.length === 0 && el.innerText?.trim() &&
  parseFloat(getComputedStyle(el).fontSize) < 12);
const isCard = !post.querySelector('video, iframe');

let overlap = '해당 없음', center = '해당 없음';
if (isCard && body) {
  const texts = [...body.children].map(R);
  overlap = texts.some(t => hit(t, R(rail)) || hit(t, R(bar)));
  const cs = getComputedStyle(body);
  center = Math.round(
    (R(body).x + parseFloat(cs.paddingLeft) + R(body).r - parseFloat(cs.paddingRight)) / 2
    - (R(post).x + R(post).w / 2));
}

// 인접 터치 타깃 간 최소 간격 — 세로로 늘어선 레일과 가로로 늘어선 도서 바를
// 각각 정렬해 이웃 간 빈틈을 잰다.
const gapMin = (els, axis) => {
  const rs = els.map(R).sort((a, b) => (axis === 'y' ? a.y - b.y : a.x - b.x));
  return rs.length < 2 ? Infinity : Math.min(...rs.slice(1).map((r, i) =>
    axis === 'y' ? r.y - rs[i].b : r.x - rs[i].r));
};

console.table({
  '유형': isCard ? '카드' : '영상',
  '본문↔크롬 겹침': overlap,
  '중앙 어긋남(px)': center,
  '최소 터치타깃(px)': Math.min(...taps.map(t => Math.min(t.w, t.h))),
  '레일 인접 간격(px)': gapMin([...rail.querySelectorAll('a, button')], 'y'),
  '도서바 인접 간격(px)': gapMin([...bar.querySelectorAll('a, button')], 'x'),
  '12px 미만 텍스트': small.length,
  '도서 제목 색': getComputedStyle(bar.querySelector('.font-medium')).color,
  '스냅 타입': getComputedStyle(post.parentElement).scrollSnapType,
  '게시물=컨테이너 높이': R(post).h === post.parentElement.clientHeight,
  '페이지 가로 스크롤': document.documentElement.scrollWidth > document.documentElement.clientWidth,
});
```

**통과 기준:**

| 항목 | 기대값 |
|---|---|
| 본문↔크롬 겹침 | `false` (카드), `해당 없음` (영상) |
| 중앙 어긋남(px) | `0` (카드) |
| 최소 터치타깃(px) | `44` 이상 |
| 레일 인접 간격(px) | `8` 이상 |
| 도서바 인접 간격(px) | `8` 이상 |
| 12px 미만 텍스트 | `0` |
| 도서 제목 색 | 4조합 모두 `rgb(255, 255, 255)` |
| 스냅 타입 | `none`이 아님 |
| 게시물=컨테이너 높이 | `true` |
| 페이지 가로 스크롤 | `false` |

추가로 눈으로 확인할 것 — 스니펫으로는 못 재는 항목이다:

- 순백에 가까운 카드에서 레일 아이콘과 카운트(655 / 0 / 43)가 **판독된다.** 스펙 "알려진 한계"대로 WCAG 수치는 낮게 남지만, 1px 윤곽 덕분에 모양은 읽혀야 한다. 안 읽히면 그림자가 유실된 것이니 Task 1 Step 4를 다시 돌린다.
- 영상 게시물의 라이트와 다크가 **하단 액션 바를 빼면 같다.**
- `/admin/posts/new` 미리보기가 피드와 같은 모습이다 (어드민은 라이트 고정이라 가장 불리한 조건이 노출된다).

## 롤백

각 태스크가 독립 커밋이므로 `git revert <sha>`로 되돌린다. Task 3만 되돌리면 Task 2의 흰색 크롬이 스크림 없이 남아 라이트에서 안 보이므로, **Task 2와 3은 함께 되돌린다.**
