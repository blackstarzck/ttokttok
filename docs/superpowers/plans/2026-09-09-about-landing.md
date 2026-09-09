# 소개 랜딩 (`/about`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 방문자에게 똑똑을 설명하는 소개 페이지를 `/about`에 만들고, 게스트 `TopBar`에 진입로를 붙인다.

**Architecture:** `(main)` 그룹 **밖**의 서버 컴포넌트 페이지 하나(`src/app/about/page.tsx`)가 `Promise.all`로 실제 콘텐츠를 세 번 읽고, `src/components/about/`의 섹션 컴포넌트들을 조합한다. 상태가 필요한 부분이 없어 `"use client"`를 쓰는 파일이 하나도 없다. 히어로 샘플만 기존 `PostCard`를 `inert` 래퍼 + 형제 오버레이 링크로 재사용한다.

**Tech Stack:** Next.js 16 App Router (서버 컴포넌트), Tailwind v4, `lucide-react`, `next/image`. **새 의존성 0개.**

## Global Constraints

설계 문서: `docs/superpowers/specs/2026-09-09-about-landing-design.md`. 아래는 모든 태스크에 암묵적으로 적용된다.

- **`src/app/globals.css`와 `docs/DESIGN.md`를 수정하지 않는다.** 최종 `git diff`에 두 파일이 나타나면 실패다 (설계 결정 2). 새 토큰을 추가하지 말고 Tailwind 기본 스케일(`text-5xl`, `py-24` 등)을 쓴다.
- **색은 시맨틱 토큰만** (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-primary`, `text-primary-foreground`, `border-border`, `bg-muted`). 원시 hex·`bg-zinc-*` 금지 — 다크모드가 깨진다 (설계 결정 3).
- **화면에 보이는 문자열에 em-dash(`—`)·en-dash(`–`)가 0개.** 하이픈이나 문장 분리로 쓴다. 이 계획서와 설계 문서는 저장소 문체를 따르지만 페이지 카피는 예외 없이 0개다.
- **아이라이(작은 대문자 라벨) 0개.** 스크롤 유도 문구(`Scroll`, `아래로`) 0개. 버전 표기(`v1.0`) 0개. 지역·시간·날씨 스트립 0개. 지표성 숫자 0개.
- **CTA 라벨은 의도당 하나**: 앱 진입은 전부 `피드 열기`, 도서 목록은 전부 `도서 목록 보기`. 다른 문구를 새로 만들지 않는다.
- **애니메이션 라이브러리를 설치하지 않는다.** `motion`·`framer-motion`·`gsap` 모두 `package.json`에 없고, 넣지 않는다. 모션은 CSS `:hover`/`:active`/`focus-visible` 전이만.
- **`window.addEventListener("scroll", ...)`를 쓰지 않는다.** 스크롤 기반 동작이 이 페이지에 없다.
- 아이콘이 필요하면 `lucide-react`만 (이미 의존성). **손으로 SVG 경로를 그리지 않는다.**
- 모든 인터랙티브 요소에 `focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none`. 터치 타깃 `min-h-11`(44px) 이상.
- 한국어 제목류에 `break-keep`. 헤드라인에 `text-balance`.
- 컨테이너는 `mx-auto max-w-6xl px-5`. **페이지 레벨 가로 스크롤 0** (가로 스크롤은 도서 스트립 내부에만).
- 파일명 kebab-case, 컴포넌트는 named export (`export default`는 `page.tsx`만).

### 테스트 규약 — vitest를 쓰지 않는다

FRONTEND.md §7이 못박은 경계다: **테스트 대상은 순수 함수뿐이고 Supabase 쿼리 빌더는 모킹하지 않는다.** "PostgREST 체인을 모킹한 테스트는 그 모킹 모양을 검증할 뿐 동작을 검증하지 않는다."

이 작업에는 순수 함수가 없다 — 전부 렌더와 조회다. 그래서 **각 태스크의 검증 사이클은 vitest가 아니라 다음 세 단계다**:

```bash
npx tsc --noEmit          # 타입 (빠름, 태스크마다)
```
그다음 브라우저에서 실제 렌더 확인 (아래 절차), 마지막에 `npm run build`와 `npm test`.

**컴포넌트용 vitest 테스트 파일을 새로 만들지 말 것.** 기존 `npm test`가 계속 통과하는지만 확인한다.

### 브라우저 확인 절차 (태스크마다 반복)

```
preview_start {name: "ttokttok-dev"}          # 포트 3001, .claude/launch.json
navigate {url: "http://localhost:3001/about"}
read_page / computer{action:"screenshot"}
read_console_messages {onlyErrors: true}      # 에러 0이어야 한다
```

두 가지 함정을 미리 적어 둔다:

1. **브라우저 창이 가려져 있으면 레이아웃 실측이 거짓말한다.** `IntersectionObserver`·`requestAnimationFrame`·scroll 이벤트는 페이지가 컴포지팅 중일 때만 돈다 (FRONTEND.md §6). 스크린샷을 찍을 때는 pane이 보이는 상태여야 한다.
2. **375px 확인은 `resize_window {preset: "mobile"}`로 하고, 확인이 끝나면 `{preset: "desktop"}`으로 되돌린다.** 에뮬레이션이 탭에 남아 다음 확인을 오염시킨다.

---

### Task 1: 라우트 골격 + 상단 바 + 푸터 + 메타데이터

`/about`이 존재하고, 상단 바가 데스크톱에서 한 줄이며, 라이트·다크 양쪽에서 선다. 아직 본문은 없다.

**Files:**
- Create: `src/app/about/page.tsx`
- Create: `src/components/about/about-nav.tsx`
- Create: `src/components/about/about-footer.tsx`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `AboutNav(): JSX.Element` — props 없음
  - `AboutFooter(): JSX.Element` — props 없음
  - `src/app/about/page.tsx`의 `default async function AboutPage()` — 이후 태스크가 여기에 섹션을 끼운다

- [ ] **Step 1: 상단 바를 만든다**

`src/components/about/about-nav.tsx`:

```tsx
import Link from "next/link";

/**
 * 소개 페이지 상단 바. 앱의 `TopBar`(홈 전용, 56px)와 별개다 — 이 페이지는
 * `(main)` 그룹 밖이라 셸을 공유하지 않는다.
 *
 * 높이 64px 고정, 한 줄. 워드마크와 CTA 하나만 둔다.
 */
export function AboutNav() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link
          href="/about"
          className="focus-visible:ring-ring rounded-md text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          똑똑
        </Link>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
        >
          피드 열기
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 푸터를 만든다**

`src/components/about/about-footer.tsx`:

```tsx
import Link from "next/link";

const LINKS = [
  { href: "/", label: "홈" },
  { href: "/discover", label: "탐색" },
  { href: "/reels", label: "릴스" },
] as const;

export function AboutFooter() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-base font-bold">똑똑</p>
          <p className="text-muted-foreground mt-1 text-sm">
            지식이 똑똑 노크해요
          </p>
        </div>
        <nav className="flex gap-6" aria-label="서비스 바로가기">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-12">
        <p className="text-muted-foreground text-xs">© 2026 똑똑</p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: 페이지를 만든다**

`src/app/about/page.tsx`:

```tsx
import type { Metadata } from "next";
import { AboutNav } from "@/components/about/about-nav";
import { AboutFooter } from "@/components/about/about-footer";

export const metadata: Metadata = {
  // 루트 레이아웃의 template("%s · 똑똑")이 붙어 "소개 · 똑똑"이 된다.
  title: "소개",
  description:
    "숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 서비스, 똑똑을 소개합니다.",
  openGraph: {
    title: "똑똑 소개",
    description:
      "숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 서비스, 똑똑을 소개합니다.",
    type: "website",
  },
};

export default async function AboutPage() {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <AboutNav />
      <main>{/* 섹션은 Task 2 이후에 채운다 */}</main>
      <AboutFooter />
    </div>
  );
}
```

- [ ] **Step 4: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음 (에러 0).

- [ ] **Step 5: 브라우저로 확인한다**

`preview_start {name: "ttokttok-dev"}` → `navigate {url: "http://localhost:3001/about"}`.

확인 항목:
- 상단 바가 한 줄, 높이 64px. CTA 라벨이 두 줄로 접히지 않는다.
- `resize_window {preset: "mobile"}`(375px)에서도 상단 바가 한 줄. 확인 후 `{preset: "desktop"}`으로 되돌린다.
- `resize_window {colorScheme: "dark"}`에서 배경과 글자가 모두 보인다. 확인 후 `light`로 되돌린다.
- `read_console_messages {onlyErrors: true}` → 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add src/app/about/page.tsx src/components/about/about-nav.tsx src/components/about/about-footer.tsx
git commit -m "feat(about): 소개 페이지 라우트와 셸을 만든다"
```

---

### Task 2: 히어로 (실제 `PostCard` 재사용)

**Files:**
- Create: `src/components/about/sample-card.tsx`
- Create: `src/components/about/about-hero.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `AboutPage`. 기존 `PostCard` (`src/components/feed/post-card.tsx`), `getFeed` (`src/lib/feed.ts`), `FeedPost` 타입.
- Produces:
  - `SampleCard({ post }: { post: FeedPost }): JSX.Element`
  - `AboutHero({ post }: { post: FeedPost | null }): JSX.Element` — `post`가 `null`이면 텍스트 단독 히어로
  - `AboutPage`가 `const seed = crypto.randomUUID()`와 `Promise.all`을 갖게 된다. Task 4·6이 이 `Promise.all` 배열에 항목을 더한다.

- [ ] **Step 1: 샘플 카드 래퍼를 만든다**

`src/components/about/sample-card.tsx`:

```tsx
import Link from "next/link";
import { PostCard } from "@/components/feed/post-card";
import type { FeedPost } from "@/lib/feed";

/**
 * 히어로의 샘플 게시물. **실제 `PostCard`를 그대로 쓴다** — 닮게 그리면
 * 언젠가 한쪽만 고쳐진다 (PRD §11-56). 어드민 미리보기가 사용자 화면과
 * 같은 컴포넌트를 쓰는 것과 같은 이유다 (§5.10).
 *
 * 조회 집계는 안전하다: `record_view`는 `card-feed.tsx`와
 * `feed-scroller.tsx`에서만 불리고 `PostCard` 자신은 부르지 않는다.
 * 그래서 피드 밖에서 렌더해도 조회수가 늘지 않는다.
 *
 * 다만 좋아요·공유는 실동작이라 막아야 한다 — 소개 페이지가 조용히
 * `share_count`를 늘리면 안 된다. 그래서 `inert`로 서브트리 전체를
 * 비활성화한다.
 *
 * `inert`가 접근성 트리에서도 서브트리를 빼므로, 대체 텍스트와 이동은
 * **형제로 얹은** 오버레이 링크가 진다. 조상으로 감싸지 않는 이유:
 * `PostCard` 안에 이미 `<a>`(채널 링크)가 있어 중첩 앵커가 되면 유효하지
 * 않은 마크업이 된다.
 *
 * 래퍼의 `overflow-hidden`은 안전하다 — 카드 높이에 상한을 두지 않으므로
 * (§11-54가 경고한 상황) 잘릴 것이 없고, `border-b`의 각진 모서리만 다듬는다.
 */
export function SampleCard({ post }: { post: FeedPost }) {
  return (
    <div className="border-border bg-card relative overflow-hidden rounded-lg border">
      <div inert>
        <PostCard post={post} isGuest />
      </div>
      <Link
        href={`/p/${post.id}`}
        aria-label={`게시물 예시 「${post.books.title}」. 실제 게시물을 엽니다.`}
        className="focus-visible:ring-ring absolute inset-0 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 2: 히어로를 만든다**

`src/components/about/about-hero.tsx`:

```tsx
import Link from "next/link";
import { SampleCard } from "@/components/about/sample-card";
import type { FeedPost } from "@/lib/feed";

/**
 * 텍스트 왼쪽, 실제 카드 오른쪽의 비대칭 split.
 *
 * 폰트 스케일이 `md:text-5xl`에서 멈추는 것은 의도다. 한글은 라틴 문자보다
 * 자당 폭이 두 배 가까워, 20자 헤드라인을 `text-6xl`(60px)로 두면 608px
 * 컬럼에서 3줄이 된다. `text-5xl`(48px)이 2줄의 상한이다.
 */
export function AboutHero({ post }: { post: FeedPost | null }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pt-14 pb-20 md:pt-24 md:pb-28">
      <div className="grid items-center gap-12 md:gap-16 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div>
          <h1 className="max-w-[38rem] text-3xl leading-[1.2] font-bold tracking-tight text-balance break-keep sm:text-4xl md:text-5xl">
            읽을 생각 없이 열어도, 첫 장이 열립니다
          </h1>
          <p className="text-muted-foreground mt-6 max-w-[34rem] text-base leading-relaxed break-keep md:text-lg">
            숏폼처럼 넘기다 마음이 가는 책을 만나면, 그 자리에서 바로 읽기
            시작합니다. 설치도 결제도 없습니다.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/"
              className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex min-h-12 items-center rounded-md px-6 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
            >
              피드 열기
            </Link>
            <Link
              href="/discover"
              className="bg-secondary text-secondary-foreground hover:bg-accent focus-visible:ring-ring inline-flex min-h-12 items-center rounded-md px-6 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
            >
              도서 목록 보기
            </Link>
          </div>
        </div>

        {post ? (
          <div className="lg:justify-self-end">
            <SampleCard post={post} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 페이지에 데이터와 히어로를 붙인다**

`src/app/about/page.tsx`의 import에 추가:

```tsx
import { getFeed } from "@/lib/feed";
import { AboutHero } from "@/components/about/about-hero";
```

`AboutPage` 본문을 이렇게 바꾼다:

```tsx
export default async function AboutPage() {
  // 방문마다 다른 카드가 걸리게 새 seed를 뽑는다 — 색을 도서 커버가 내는
  // 페이지라(설계 결정 3) 카드가 바뀌면 인상도 바뀐다.
  const seed = crypto.randomUUID();

  // sessionId에 null을 넘겨도 안전하다. `(main)/page.tsx`가 경고하는 문제는
  // 1페이지와 다음 페이지가 다른 세션 id로 점수를 계산해 같은 게시물이 두
  // 페이지에 겹치는 것인데, 여기는 1건만 받고 페이지네이션을 하지 않는다.
  const [cardFeed] = await Promise.all([
    getFeed(seed, null, 1, null, "cards"),
  ]);

  // 실패를 빈 값으로 삼키지 않는다 (FRONTEND.md §5). 카드를 못 구하면
  // 히어로가 텍스트 단독으로 좁혀 선다 — 히어로가 통째로 사라지면 페이지가
  // 제목 없이 시작한다.
  const samplePost = cardFeed.failed ? null : (cardFeed.posts[0] ?? null);

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <AboutNav />
      <main>
        <AboutHero post={samplePost} />
      </main>
      <AboutFooter />
    </div>
  );
}
```

- [ ] **Step 4: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

`inert`에서 타입 에러가 나면 React 19 타입이 아닌 것이다 — `@types/react` 버전을 확인한다 (이 저장소는 `^19`).

- [ ] **Step 5: 브라우저로 확인한다**

`navigate {url: "http://localhost:3001/about"}` 후:
- 헤드라인이 데스크톱에서 **2줄 이내**. 3줄이면 `md:text-5xl`을 `md:text-4xl`로 낮춘다.
- 히어로 전체가 첫 화면에 들어온다. CTA 두 개가 스크롤 없이 보인다.
- 각 CTA 라벨이 **한 줄**. 줄바꿈되면 실패다.
- 샘플 카드에 **실제 도서 커버와 채널 이름**이 보인다.
- 샘플 카드의 좋아요·공유 버튼이 **눌리지 않는다**: `computer{action:"left_click"}`으로 하트를 눌러 보고 아무 일도 없어야 한다.
- 카드 아무 곳이나 누르면 `/p/<id>`로 이동한다. 이동을 확인한 뒤 `/about`으로 돌아온다.
- 375px과 다크에서 각각 확인 후 되돌린다.
- `read_console_messages {onlyErrors: true}` → 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add src/components/about/sample-card.tsx src/components/about/about-hero.tsx src/app/about/page.tsx
git commit -m "feat(about): 실제 PostCard를 재사용하는 히어로를 붙인다"
```

---

### Task 3: 핵심 루프 밴드

**Files:**
- Create: `src/components/about/about-loop.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `AboutPage`
- Produces: `AboutLoop(): JSX.Element` — props 없음

- [ ] **Step 1: 루프 밴드를 만든다**

`src/components/about/about-loop.tsx`:

```tsx
const STEPS = [
  {
    title: "피드에서 발견",
    body: "장르별 큐레이션 채널이 책 한 권을 카드 한 장으로 소개합니다.",
  },
  {
    title: "탭 한 번에 읽기",
    body: "전문을 가진 책은 그 자리에서 뷰어가 열립니다. 로그인도 필요 없습니다.",
  },
  {
    title: "진행률로 이어읽기",
    body: "어디까지 읽었는지 남습니다. 보관함과 완독 기록도 함께 쌓입니다.",
  },
] as const;

/**
 * 카드를 쓰지 않는다 — 표면을 세울 위계가 없고, 여기서는 헤어라인이 같은
 * 일을 더 조용히 한다.
 *
 * 컬럼 폭을 1.2fr / 1fr / 1fr로 흘려 균등 3분할을 피한다.
 */
export function AboutLoop() {
  return (
    <section className="border-border border-y" aria-label="이용 흐름">
      <div className="divide-border mx-auto max-w-6xl divide-y md:grid md:grid-cols-[1.2fr_1fr_1fr] md:divide-x md:divide-y-0">
        {STEPS.map((step) => (
          <div key={step.title} className="px-5 py-10 md:px-8 md:py-14">
            <h2 className="text-lg font-bold tracking-tight break-keep md:text-xl">
              {step.title}
            </h2>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed break-keep">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 페이지에 붙인다**

`src/app/about/page.tsx`에 `import { AboutLoop } from "@/components/about/about-loop";`를 추가하고, `<AboutHero .../>` 바로 아래에 `<AboutLoop />`를 넣는다.

- [ ] **Step 3: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

- [ ] **Step 4: 브라우저로 확인한다**

- 데스크톱에서 세 칸이 세로 구분선으로 갈리고 첫 칸이 조금 넓다.
- 375px에서 세 칸이 가로 구분선으로 세로로 쌓인다.
- 다크에서 구분선이 보인다.
- `read_console_messages {onlyErrors: true}` → 에러 0.

- [ ] **Step 5: 커밋**

```bash
git add src/components/about/about-loop.tsx src/app/about/page.tsx
git commit -m "feat(about): 핵심 루프 밴드를 붙인다"
```

---

### Task 4: 추천 도서 스트립

**Files:**
- Create: `src/components/about/book-strip.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `Promise.all`. 기존 `BookCover` (`src/components/feed/book-cover.tsx`), `getFeaturedBooks`·`DiscoverBook` (`src/lib/discover.ts`).
- Produces: `BookStrip({ books }: { books: DiscoverBook[] }): JSX.Element | null` — 빈 배열이면 `null`을 돌려 섹션을 접는다.

- [ ] **Step 1: 스트립을 만든다**

`src/components/about/book-strip.tsx`:

```tsx
import Link from "next/link";
import { BookCover } from "@/components/feed/book-cover";
import type { DiscoverBook } from "@/lib/discover";

/**
 * 색이 들어오는 자리다 (설계 결정 3) — 면은 무채색이고 실제 도서 커버가
 * 유일한 색이다.
 *
 * 가로 스크롤은 이 컨테이너 안에만 있다. 페이지 레벨 가로 스크롤은 0이어야
 * 한다.
 *
 * 빈 배열이면 `null` — "추천 도서가 없습니다"는 소개 페이지에서 정보가
 * 아니라 흠이다 (FRONTEND.md §5).
 */
export function BookStrip({ books }: { books: DiscoverBook[] }) {
  if (books.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <h2 className="text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
        지금 읽을 수 있는 책
      </h2>

      <ul className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {books.map((book) => (
          <li key={book.id} className="w-28 shrink-0 snap-start sm:w-32 md:w-40">
            <BookCover book={book} />
            <p className="mt-2 truncate text-sm font-medium break-keep">
              {book.title}
            </p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {book.author}
            </p>
          </li>
        ))}
      </ul>

      <Link
        href="/discover"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-8 inline-flex min-h-11 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        도서 목록 보기
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: 페이지에서 데이터를 읽어 넘긴다**

import에 추가:

```tsx
import { getFeaturedBooks } from "@/lib/discover";
import { BookStrip } from "@/components/about/book-strip";
```

`Promise.all`을 두 항목으로 늘린다:

```tsx
  const [cardFeed, featured] = await Promise.all([
    getFeed(seed, null, 1, null, "cards"),
    getFeaturedBooks(),
  ]);
```

`samplePost` 아래에 추가:

```tsx
  const featuredBooks = featured.failed ? [] : featured.books;
```

`<AboutLoop />` 아래에 `<BookStrip books={featuredBooks} />`를 넣는다.

- [ ] **Step 3: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

- [ ] **Step 4: 브라우저로 확인한다**

- 실제 도서 커버가 보인다. 커버 이미지가 깨지면 `next.config.ts`의
  `remotePatterns`에 Supabase 호스트가 있는지 확인한다 (있어야 정상).
- 스트립을 좌우로 밀 수 있고, **페이지 자체는 가로로 밀리지 않는다.**
  `javascript_tool`로 확인: `document.documentElement.scrollWidth <= window.innerWidth` → `true`.
- 추천 도서가 0건이면 섹션이 아예 없다 (제목도 없다).
- 375px·다크 확인 후 되돌린다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/about/book-strip.tsx src/app/about/page.tsx
git commit -m "feat(about): 실제 추천 도서 커버 스트립을 붙인다"
```

---

### Task 5: 실제 화면 캡처 + 뷰어 섹션

**Files:**
- Create: `public/about/reader.png` (실제 캡처)
- Create: `src/components/about/device-frame.tsx`
- Create: `src/components/about/reader-section.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `AboutPage`
- Produces:
  - `DeviceFrame({ src, alt, width, height, priority }: { src: string; alt: string; width: number; height: number; priority?: boolean }): JSX.Element` — `width`/`height`는 캡처 PNG의 실제 픽셀 크기
  - `ReaderSection({ src, width, height }: { src: string | null; width: number; height: number }): JSX.Element | null` — `src`가 `null`이면 `null`

- [ ] **Step 1: 전문 도서가 있는지 확인한다**

`navigate {url: "http://localhost:3001/discover"}`로 도서를 찾거나, 홈 카드의 도서 바를 눌러 시트에서 「바로 읽기」가 있는 책(= `epub_path`가 있는 전문 도서)을 하나 찾는다. 그 책의 `/read/<bookId>` 주소를 적어 둔다.

**전문 도서가 하나도 없으면 이 태스크를 중단하고 Task 6으로 넘어간다.** `src={null}`로 두면 섹션이 렌더되지 않는다. 없는 화면을 그려 넣지 않는다 (설계 결정 6). 최종 보고에 "뷰어 섹션은 전문 도서가 없어 빠졌다"고 적는다.

- [ ] **Step 2: 뷰어 화면을 캡처한다**

```
resize_window {preset: "mobile"}          # 375x812
navigate {url: "http://localhost:3001/read/<bookId>"}
```

본문이 실제로 그려진 것을 확인한 뒤 `computer {action: "screenshot"}`. 저장한 이미지를 `public/about/reader.png`로 옮긴다. 끝나면 `resize_window {preset: "desktop"}`.

가짜 화면을 그리지 않는다. 이건 실제 제품 화면이다.

**저장한 PNG의 실제 픽셀 크기를 확인한다** — 다음 스텝의 `DeviceFrame`이 그 값을 `width`/`height`로 받아 비율을 예약한다. 값이 실제와 다르면 이미지가 늘어나거나 레이아웃이 밀린다:

```bash
node -e "const b=require('fs').readFileSync('public/about/reader.png');console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20))"
```

- [ ] **Step 3: 프레임 컴포넌트를 만든다**

`src/components/about/device-frame.tsx`:

```tsx
import Image from "next/image";

/**
 * 실제 화면 캡처를 모바일 폭 프레임에 담는다. 뷰어·릴스 섹션이 공유한다.
 *
 * `width`/`height`로 비율을 먼저 예약해 레이아웃 시프트를 막는다 (CLS).
 * 두 값은 **캡처 PNG의 실제 픽셀 크기**여야 한다 — 호출부가 넘긴다.
 */
export function DeviceFrame({
  src,
  alt,
  width,
  height,
  priority = false,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
}) {
  return (
    <div className="border-border bg-card mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(max-width: 768px) 70vw, 280px"
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  );
}
```

- [ ] **Step 4: 뷰어 섹션을 만든다**

`src/components/about/reader-section.tsx`:

```tsx
import { DeviceFrame } from "@/components/about/device-frame";

/**
 * 히어로와 좌우가 반전된 split — 데스크톱에서 캡처가 왼쪽이다.
 *
 * DOM 순서는 텍스트가 먼저다. 375px에서는 제목을 읽고 나서 화면을 보는
 * 편이 자연스럽고, 데스크톱 배치는 `md:order-*`가 뒤집는다.
 */
export function ReaderSection({
  src,
  width,
  height,
}: {
  src: string | null;
  width: number;
  height: number;
}) {
  if (!src) return null;

  return (
    <section className="border-border bg-muted/40 border-y">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="md:order-2">
          <h2 className="text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
            발견에서 첫 장까지, 탭 한 번
          </h2>
          <p className="text-muted-foreground mt-5 max-w-[32rem] text-base leading-relaxed break-keep">
            서점을 검색하고 앱을 설치하는 과정이 없습니다. 카드에서 마음이
            움직인 그 순간에 뷰어가 열립니다. 글자 크기와 배경은 읽는 중에
            바꿀 수 있고, 읽던 위치는 저장됩니다.
          </p>
        </div>
        <div className="md:order-1">
          <DeviceFrame
            src={src}
            alt="똑똑 전자책 뷰어 화면"
            width={width}
            height={height}
          />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: 페이지에 붙인다**

import에 `import { ReaderSection } from "@/components/about/reader-section";`를 추가하고, `<BookStrip .../>` 아래에 넣는다. `width`/`height`는 Step 2에서 확인한 PNG 실제 크기다 (아래는 375x812 캡처를 가정한 값 — 실측이 다르면 그 값을 쓴다).

```tsx
        <ReaderSection src="/about/reader.png" width={375} height={812} />
```

Step 2를 중단했으면 `src={null}`로 두고 `width`/`height`는 아무 양수여도 된다 (`null`에서 먼저 반환한다).

- [ ] **Step 6: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

- [ ] **Step 7: 브라우저로 확인한다**

- 캡처가 보이고 깨지지 않는다.
- 데스크톱에서 캡처가 왼쪽, 텍스트가 오른쪽.
- 375px에서 제목·본문이 먼저, 캡처가 그 아래.
- 다크에서 `bg-muted/40` 띠가 배경과 구분되고 글자가 읽힌다.
- `read_console_messages {onlyErrors: true}` → 에러 0.

- [ ] **Step 8: 커밋**

```bash
git add public/about/reader.png src/components/about/device-frame.tsx src/components/about/reader-section.tsx src/app/about/page.tsx
git commit -m "feat(about): 실제 뷰어 화면 캡처로 뷰어 섹션을 붙인다"
```

---

### Task 6: 릴스 섹션

**Files:**
- Create: `public/about/reels.png` (실제 캡처)
- Create: `src/components/about/reels-section.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: Task 4의 `Promise.all`, Task 5의 `DeviceFrame`, 기존 `BookCover`, `FeedPost` 타입
- Produces: `ReelsSection({ src, width, height, posts }: { src: string | null; width: number; height: number; posts: FeedPost[] }): JSX.Element | null` — `src`가 `null`이거나 `posts`가 비면 `null`

- [ ] **Step 1: 영상 게시물이 있는지 확인하고 캡처한다**

```
resize_window {preset: "mobile"}
navigate {url: "http://localhost:3001/reels"}
```

영상이 실제로 그려지면 `computer {action: "screenshot"}` → `public/about/reels.png`. 끝나면 `resize_window {preset: "desktop"}`.

PNG 실제 크기를 확인해 둔다 (Step 3에서 쓴다):

```bash
node -e "const b=require('fs').readFileSync('public/about/reels.png');console.log(b.readUInt32BE(16)+'x'+b.readUInt32BE(20))"
```

**영상 게시물이 없으면 이 태스크를 건너뛴다** — `src={null}`로 두면 섹션이 안 그려진다. 최종 보고에 적는다.

- [ ] **Step 2: 릴스 섹션을 만든다**

`src/components/about/reels-section.tsx`:

```tsx
import { DeviceFrame } from "@/components/about/device-frame";
import { BookCover } from "@/components/feed/book-cover";
import type { FeedPost } from "@/lib/feed";

/**
 * 오프셋 그리드 — 뷰어 섹션의 균등 2분할과 다른 계열이다. 캡처 컬럼을
 * 좁게 두고 `md:items-end`로 아래를 맞춘다.
 *
 * **영상을 재생하지 않는다.** 랜딩에 YouTube 임베드나 자동재생 플레이어를
 * 얹으면 LCP·INP를 그만큼 잃고, 소개 페이지가 얻는 것보다 비싸다 (설계
 * 결정 6). 캡처와 실제 영상 게시물의 도서 커버로 대신 보여준다.
 *
 * 커버는 `posts.length`만큼만 그린다 — 빈 칸을 채우려 자리표시를 넣지
 * 않는다.
 */
export function ReelsSection({
  src,
  width,
  height,
  posts,
}: {
  src: string | null;
  width: number;
  height: number;
  posts: FeedPost[];
}) {
  if (!src || posts.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
      <div className="grid gap-12 md:grid-cols-[minmax(0,280px)_1fr] md:items-end md:gap-16">
        <DeviceFrame
          src={src}
          alt="똑똑 릴스 화면"
          width={width}
          height={height}
        />

        <div>
          <h2 className="text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
            영상으로 만나는 책
          </h2>
          <p className="text-muted-foreground mt-5 max-w-[32rem] text-base leading-relaxed break-keep">
            글보다 영상이 편한 날에는 릴스 탭에서 짧은 소개를 넘겨 보세요.
            마음에 남은 책은 그대로 뷰어나 서점 링크로 이어집니다.
          </p>

          <ul
            className="mt-8 grid max-w-md gap-3"
            style={{
              // 칸 수를 항목 수에 맞춘다 — 빈 칸을 만들지 않는다. 4로 묶는
              // 이유는 `getFeed`에 4를 요청하기 때문이고, `max-w-md`는 게시물이
              // 1건만 돌아왔을 때 커버가 컬럼 폭만큼 커지는 것을 막는다.
              gridTemplateColumns: `repeat(${Math.min(posts.length, 4)}, minmax(0, 1fr))`,
            }}
          >
            {posts.map((post) => (
              <li key={post.id}>
                <BookCover book={post.books} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 페이지에서 영상 게시물을 읽어 넘긴다**

import에 `import { ReelsSection } from "@/components/about/reels-section";`를 추가한다.

`Promise.all`을 세 항목으로 늘린다:

```tsx
  const [cardFeed, featured, videoFeed] = await Promise.all([
    getFeed(seed, null, 1, null, "cards"),
    getFeaturedBooks(),
    getFeed(seed, null, 4, null, "video"),
  ]);
```

`featuredBooks` 아래에 추가:

```tsx
  const videoPosts = videoFeed.failed ? [] : videoFeed.posts;
```

`<ReaderSection .../>` 아래에 넣는다:

`width`/`height`는 Step 1에서 확인한 PNG 실제 크기다:

```tsx
        <ReelsSection
          src="/about/reels.png"
          width={375}
          height={812}
          posts={videoPosts}
        />
```

- [ ] **Step 4: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

- [ ] **Step 5: 브라우저로 확인한다**

- 커버 개수가 실제 영상 게시물 수와 같고 **빈 칸이 없다.**
- 데스크톱에서 캡처와 텍스트 블록의 아래가 맞는다.
- 375px에서 세로로 쌓이고 커버 줄이 넘치지 않는다.
- 페이지 가로 스크롤이 여전히 0: `document.documentElement.scrollWidth <= window.innerWidth` → `true`.

- [ ] **Step 6: 커밋**

```bash
git add public/about/reels.png src/components/about/reels-section.tsx src/app/about/page.tsx
git commit -m "feat(about): 릴스 섹션을 붙인다"
```

---

### Task 7: 저작권 섹션 + 닫는 CTA

**Files:**
- Create: `src/components/about/rights-section.tsx`
- Create: `src/components/about/closing-cta.tsx`
- Modify: `src/app/about/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `AboutPage`
- Produces: `RightsSection(): JSX.Element`, `ClosingCta(): JSX.Element` — 둘 다 props 없음

- [ ] **Step 1: 저작권 섹션을 만든다**

카피는 PRD §5.11의 만료 판별 규칙을 그대로 옮긴 것이다. **문구를 바꾸지 말 것** — 법적 주장이라 §5.11과 어긋나면 안 된다.

`src/components/about/rights-section.tsx`:

```tsx
/**
 * 첫 방문자가 실제로 하는 질문("무료로 전문을 준다니, 합법인가")에 답한다.
 * §5.11의 권리 판정은 공들인 작업인데 사용자 화면 어디에도 드러나 있지
 * 않았다.
 *
 * 카피는 PRD §5.11의 만료 판별 규칙을 그대로 옮겼다. 법적 주장이므로
 * 문구를 임의로 바꾸면 안 된다.
 */
export function RightsSection() {
  return (
    <section className="border-border bg-muted/40 border-t">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <h2 className="max-w-[34rem] text-2xl font-bold tracking-tight text-balance break-keep md:text-3xl">
          본문을 드리는 책은 저작권이 만료된 작품입니다
        </h2>

        <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-16">
          <p className="text-muted-foreground max-w-[34rem] text-base leading-relaxed break-keep">
            전문을 읽을 수 있는 책은 1962년 이전에 사망한 저작자의 작품입니다.
            2013년 개정 전 기준인 사후 50년으로 보호기간이 이미 끝난
            저작물이고, 개정된 70년 기준은 그 전에 만료된 작품에 소급되지
            않습니다. 본문은 위키문헌에서 수급해 저작자의 사망 연도를 확인한
            뒤 등록합니다.
          </p>
          <p className="text-muted-foreground max-w-[34rem] text-base leading-relaxed break-keep">
            해외 고전은 원작이 만료되었어도 한국어 번역본에 번역자의 저작권이
            따로 남아 있어 본문을 제공하지 않습니다. 저작권이 살아 있는 책은
            소개 카드와 서점 구매 링크까지만 보여드립니다.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: 닫는 CTA를 만든다**

`src/components/about/closing-cta.tsx`:

```tsx
import Link from "next/link";

/**
 * 라벨이 상단 바·히어로와 같은 `피드 열기`다. 같은 의도에 문구를 여러 개
 * 두면 방문자가 서로 다른 곳으로 가는 줄 안다.
 *
 * 중앙 정렬을 쓰는 유일한 섹션이다 — 마지막에 남는 선택이 하나뿐이라
 * 시선을 나눌 이유가 없다.
 */
export function ClosingCta() {
  return (
    <section className="border-border border-t">
      <div className="mx-auto max-w-6xl px-5 py-24 text-center md:py-32">
        <h2 className="mx-auto max-w-[28rem] text-2xl font-bold tracking-tight text-balance break-keep md:text-4xl">
          읽을 책은 이미 피드에 있습니다
        </h2>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring mt-9 inline-flex min-h-12 items-center rounded-md px-7 text-base font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none active:translate-y-px"
        >
          피드 열기
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 페이지에 붙인다**

import 두 줄을 추가하고 `<ReelsSection .../>` 아래에 순서대로 넣는다:

```tsx
        <RightsSection />
        <ClosingCta />
```

- [ ] **Step 4: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

- [ ] **Step 5: 브라우저로 확인한다**

- 저작권 섹션이 데스크톱에서 2컬럼, 375px에서 세로로 쌓인다.
- 닫는 CTA 라벨이 상단 바와 같은 `피드 열기`다.
- CTA가 `bg-primary` 위 `text-primary-foreground`로 라이트·다크 양쪽에서 읽힌다.
- 375px·다크 확인 후 되돌린다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/about/rights-section.tsx src/components/about/closing-cta.tsx src/app/about/page.tsx
git commit -m "feat(about): 저작권 설명과 닫는 CTA를 붙인다"
```

---

### Task 8: 게스트 `TopBar`에 「소개」 진입로

**Files:**
- Modify: `src/components/feed/top-bar.tsx`

**Interfaces:**
- Consumes: 기존 `TopBar({ isGuest }: { isGuest: boolean })` — 시그니처를 **바꾸지 않는다**
- Produces: 없음 (마지막 UI 태스크)

- [ ] **Step 1: 링크를 추가한다**

기존 알림 `<Link>` 블록 전체를 아래 `<div>`로 **감싸 바꾼다.** 알림 링크 자체의 `href`·`aria-label`·클래스·`Bell`·`UnreadBadge`는 한 글자도 바꾸지 않는다 (아래 코드에 그대로 옮겨 두었다). 워드마크 `<span>`은 건드리지 않는다.

`Link`는 이미 이 파일에서 import되어 있으므로 import 추가는 없다.

```tsx
      <div className="flex items-center gap-1">
        {isGuest ? (
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center rounded-md px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            소개
          </Link>
        ) : null}

        <Link
          href={isGuest ? "/login?next=/notifications" : "/notifications"}
          aria-label="알림"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring relative flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <Bell className="size-6" aria-hidden />
          {isGuest ? null : <UnreadBadge />}
        </Link>
      </div>
```

주석을 `TopBar`의 JSDoc 끝에 한 줄 더한다:

```
 * 비로그인일 때만 「소개」(`/about`)가 붙는다 — 이미 쓰고 있는 사람에게
 * 소개를 권할 이유가 없다.
```

- [ ] **Step 2: 타입을 확인한다**

Run: `npx tsc --noEmit`
Expected: 출력 없음.

- [ ] **Step 3: 브라우저로 확인한다**

`navigate {url: "http://localhost:3001/"}`:
- 비로그인 상태에서 상단 바에 「소개」와 알림 종이 **한 줄**로 보인다.
- 375px에서도 워드마크·소개·종이 겹치지 않는다.
- 「소개」를 누르면 `/about`으로 간다.
- 상단 바 높이가 여전히 56px이고 카드 목록이 밀리지 않았다.
- 알림 종의 터치 타깃이 44px 이상 그대로다.

- [ ] **Step 4: 커밋**

```bash
git add src/components/feed/top-bar.tsx
git commit -m "feat(about): 게스트 상단 바에 소개 진입로를 붙인다"
```

---

### Task 9: 최종 검증

코드를 더 쓰지 않는다. 완료 기준을 실제로 통과시키는 태스크다.

**Files:** 없음 (검증만; 실패가 나오면 해당 파일을 고친다)

- [ ] **Step 1: 빌드와 테스트**

```bash
npm run build
```
Expected: 성공. 타입 에러 0. `/about`이 라우트 목록에 나온다.

```bash
npm test
```
Expected: 기존 테스트 전부 통과. 새로 추가한 테스트는 없다.

- [ ] **Step 2: 375px 렌더 확인 (AGENTS.md 완료 기준)**

`resize_window {preset: "mobile"}` → `/about` 전체를 위에서 아래까지 스크롤하며 스크린샷.

- 모든 섹션이 단일 컬럼.
- 잘리거나 겹친 텍스트 없음.
- CTA 라벨 줄바꿈 없음.
- 가로 스크롤 0: `document.documentElement.scrollWidth <= window.innerWidth` → `true`.

- [ ] **Step 3: 다크모드 확인**

`resize_window {colorScheme: "dark"}` → 다시 전체 스크롤.

- 흰 판으로 남은 섹션이 없다 (원시 색을 쓴 자리를 잡아낸다).
- 모든 텍스트가 읽힌다. `bg-muted/40` 띠도 배경과 구분된다.
- 확인 후 `{colorScheme: "light"}`, `{preset: "desktop"}`으로 되돌린다.

- [ ] **Step 4: 데스크톱(1280px) 확인**

`resize_window {width: 1280, height: 900}` → 전체 스크롤.

- 상단 바 한 줄, 높이 64px.
- 히어로 헤드라인 2줄 이내.
- 일곱 섹션의 레이아웃이 서로 다르다. 같은 형태가 두 번 나오면 실패다.

- [ ] **Step 5: 콘솔과 diff 확인**

```
read_console_messages {onlyErrors: true}      # 0건
```

```bash
git diff --stat master...HEAD
```

- `src/app/globals.css`가 **없다.**
- `docs/DESIGN.md`가 **없다.**
- `src/app/(main)/` 아래 파일이 **없다.**
- `package.json`이 **없다** (새 의존성 0).

- [ ] **Step 6: 카피 자체 감사**

`/about`에 보이는 모든 문자열을 다시 읽는다.

```bash
grep -rn "—\|–" src/app/about src/components/about
```
Expected: 출력 없음 (em-dash·en-dash 0개).

그리고 눈으로 확인한다:
- 문법이 깨진 문장, 가리키는 대상이 불분명한 문장이 없다.
- 지표성 숫자가 없다. 저작권 섹션의 `1962`·`2013`·`50`·`70`은 PRD §5.11의
  실제 법령 기준이라 예외다.
- 아이라이 라벨 0개. 스크롤 유도 문구 0개. 버전 표기 0개.
- CTA 라벨이 의도당 하나(`피드 열기` / `도서 목록 보기`)다.

- [ ] **Step 7: 접근성 확인**

- `Tab`으로 페이지를 처음부터 끝까지 통과: 모든 링크에 포커스 링이 보인다.
- 히어로 샘플 카드는 **오버레이 링크 하나만** 포커스를 받는다 (`inert`가
  안쪽을 뺀다).
- 이미지에 의미 있는 `alt`가 있다.

- [ ] **Step 8: 커밋 (수정이 있었다면)**

```bash
git add -A
git commit -m "fix(about): 최종 검증에서 나온 문제를 고친다"
```

---

## 남는 한계 (사용자에게 보고할 것)

- **핀치 줌이 막혀 있다.** 루트 레이아웃의 `viewport.maximumScale = 1`이
  전역이고, 주석에 "숏폼 피드는 확대/축소 시 스냅 스크롤이 깨진다"는 이유가
  적혀 있다. 텍스트가 많은 소개 페이지에서는 WCAG 1.4.4(텍스트 크기 조정)에
  걸리는 제약이지만, 전역 값을 이 작업에서 바꾸면 피드 스냅에 영향이 간다.
  **이 계획에서는 건드리지 않고 보고한다.**
