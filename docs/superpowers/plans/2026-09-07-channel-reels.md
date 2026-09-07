# IA 개편 4단계 — 채널 스코프 릴스 뷰어 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채널 페이지에서 영상 게시물을 탭하면 **그 채널의 영상만** 위아래로 넘기는 전면 뷰어로 들어간다.

**Architecture:** 랭킹 피드가 아니라 **순서가 정해진 목록**이다 — 채널 그리드와 같은 `published_at desc`로 그 채널의 영상을 모두 받아, 탭한 게시물 위치에서 시작한다. 랭킹·커서·프리페치가 없으므로 "임의 게시물 위치에 피드를 맞추는" 어려운 문제(결정 10이 급상승에서 피한 그것)가 여기서는 발생하지 않는다. 화면은 릴스와 같은 `FeedScroller` + `PostItem`을 재사용하고, 시작 인덱스만 받게 한다.

**Tech Stack:** Next.js 16.3.3 App Router / React 19 / Supabase / Tailwind v4 / Vitest

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-09-04-ia-restructure-design.md` — **결정 7·10**.
- **입구는 채널 페이지다** (결정 7). 홈 카드에는 영상이 없고(결정 1·5), 릴스 탭 안에서 데이터 소스를 바꾸는 안은 뒤로가기·공유의 의미가 복잡해져 기각했다.
- **카드 게시물의 목적지는 바뀌지 않는다.** 채널 그리드에서 카드 게시물은 지금처럼 `/p/[postId]`로 간다 — 카드용 전면 뷰어는 없다.
- **랭킹을 쓰지 않는다.** `get_feed_v4`는 점수가 시간에 따라 변해(seen_penalty) 커서와 어긋나는 문제가 이미 알려져 있다. 채널 뷰어는 단순 정렬 목록이라 그 문제를 아예 갖지 않는다.
- 스타일: 시맨틱 토큰만. **예외**: 피드 위에 얹히는 크롬은 흰색 고정 (`docs/DESIGN.md` Colors) — 이 화면은 전면 피드라 그 예외 안이다.
- `docs/DESIGN.md:155` verbatim: `터치 타깃 최소 44×44px, 인접 타깃 간 8px 이상.` **두 절 모두.**
- 서버 컴포넌트가 기본. `"use client"`는 최소 잎에만. 카드 템플릿 트리를 클라이언트 번들에 넣지 않는다.
- 보안은 RLS가 담당. 발행되지 않은 게시물은 RLS가 막는다.
- 한국어 주석으로 **왜**를 적는다. 커밋 메시지는 한국어 + Conventional Commits.
- 문서와 코드가 어긋난 채 커밋하지 않는다 (`AGENTS.md` 완료 기준).

---

## File Structure

| 파일 | 책임 | 변경 | 태스크 |
|---|---|---|---|
| `src/lib/feed.ts` | `getChannelVideos` 추가 | 수정 | 1 |
| `src/lib/channel.ts` | slug → 채널 조회를 두 라우트가 공유 | 생성 | 2 |
| `src/components/feed/feed-scroller.tsx` | 시작 인덱스 prop | 수정 | 1 |
| `src/app/(main)/channel/[slug]/reels/page.tsx` | 채널 스코프 뷰어 | 생성 | 2 |
| `src/app/(main)/channel/[slug]/page.tsx` | 영상 게시물의 목적지 변경 | 수정 | 2 |
| `docs/prd-ttokttok.md` | §4 라우트, §5.6 급상승 목적지 정정, §5.9 채널, §11 결정 기록 | 수정 | 3 |

---

## Task 1: 데이터와 스크롤러 준비

**Files:**
- Modify: `src/lib/feed.ts`
- Modify: `src/components/feed/feed-scroller.tsx`

**Interfaces:**
- Produces:
  - `getChannelVideos(channelId: string, limit?: number): Promise<FeedPost[]>`
  - `FeedScroller`에 `initialIndex?: number` (기본 0)

- [ ] **Step 1: 채널 영상 조회**

`src/lib/feed.ts`의 `getChannelPosts` 바로 아래에 넣는다. 그 함수를 읽고 같은 모양을 따른다.

```ts
/**
 * 채널 하나의 발행된 **영상** 게시물. 채널 스코프 릴스 뷰어가 쓴다.
 *
 * 랭킹(get_feed_v4)을 타지 않고 채널 그리드와 같은 발행 역순으로 준다 —
 * 사용자가 그리드에서 본 순서 그대로 위아래로 넘기게 하려는 것이고,
 * 그래야 "탭한 게시물에서 시작"이 목록 안의 단순한 인덱스가 된다.
 * 랭킹을 쓰면 커서·점수 때문에 임의 위치에서 시작하는 것이 어려워진다
 * (결정 10이 급상승에서 피한 문제와 같다).
 */
export async function getChannelVideos(
  channelId: string,
  limit = 30,
): Promise<FeedPost[]> {
  const db = await createClient();

  const { data, error } = await db
    .from("posts")
    .select(SELECT)
    .eq("channel_id", channelId)
    .eq("status", "published")
    .eq("type", "video")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getChannelVideos:", error.message);
    return [];
  }
  return (data ?? []) as unknown as FeedPost[];
}
```

- [ ] **Step 2: 스크롤러에 시작 인덱스**

`FeedScroller`는 지금 `active`를 0으로 시작하고 `|i - active| <= WINDOW`만 마운트한다. 채널 뷰어는 목록 중간에서 시작하므로 두 가지가 필요하다: 초기 `active` 값과, 그 슬롯으로 실제 스크롤.

props에 추가:

```tsx
  /**
   * 처음 보여줄 슬롯. 채널 스코프 뷰어가 "탭한 게시물에서 시작"에 쓴다.
   * active의 초기값이자 마운트 직후 스크롤 위치다 — 윈도우가 active 기준
   * ±2만 마운트하므로 둘 중 하나만 하면 빈 화면이나 엉뚱한 위치가 된다.
   */
  initialIndex?: number;
```

`const [active, setActive] = useState(0);` → `useState(initialIndex)`.

컨테이너 스크롤을 그 슬롯에 맞추는 effect를 추가한다. **마운트 시 한 번만** 돌아야 한다 — 매번 돌면 사용자가 스크롤한 것을 되돌린다:

```tsx
  // 시작 슬롯으로 한 번만 이동한다. 스냅 컨테이너라 scrollTop을 직접 준다 —
  // scrollIntoView는 부모 스크롤까지 건드릴 수 있다.
  const jumpedRef = useRef(false);
  useEffect(() => {
    if (jumpedRef.current || initialIndex === 0) return;
    const container = containerRef.current;
    const slot = container?.querySelector<HTMLElement>(
      `[data-index="${initialIndex}"]`,
    );
    if (!container || !slot) return;
    jumpedRef.current = true;
    container.scrollTop = slot.offsetTop;
  }, [initialIndex]);
```

> `data-index`는 이미 슬롯 래퍼에 있다(조회 집계용 IntersectionObserver가 그걸 관찰한다). 확인하고 쓸 것.

- [ ] **Step 3: 회귀가 없는지 확인**

`initialIndex` 기본값이 0이므로 릴스(`/reels`)는 한 줄도 안 바뀌어야 한다. `jumpedRef` effect도 `initialIndex === 0`이면 즉시 빠진다.

```bash
npx vitest run
npm run build
```

기대: `64 passed`, 빌드 성공.

`/reels`를 375px에서 열어 **이전과 똑같이 첫 게시물에서 시작**하는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/feed.ts src/components/feed/feed-scroller.tsx
git commit -m "feat(feed): 채널 영상 조회 + 스크롤러 시작 인덱스"
```

---

## Task 2: 채널 스코프 뷰어

**Files:**
- Create: `src/app/(main)/channel/[slug]/reels/page.tsx`
- Modify: `src/app/(main)/channel/[slug]/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `getChannelVideos`, `FeedScroller initialIndex`
- Produces: `/channel/[slug]/reels?start=<postId>` 라우트

- [ ] **Step 1: 뷰어 라우트**

`src/app/(main)/channel/[slug]/reels/page.tsx`. Next 16의 타입 헬퍼(`PageProps<"/channel/[slug]/reels">`)를 쓰고 손으로 타입을 쓰지 않는다 — `searchParams` 값은 `string | string[] | undefined`다.

**slug로 채널을 찾는 함수를 복제하지 말 것.** 지금 `getChannel(slug)`은 `channel/[slug]/page.tsx` 안의 로컬 함수다. 두 라우트가 쓰게 되므로 공유 위치로 옮긴다 — `src/lib/channel.ts`를 새로 만들어 거기서 내보내고, 기존 페이지도 그걸 import하게 바꾼다. 이 저장소가 문자열 복제 때문에 이미 두 번 갈라진 전례가 있다(`chrome.ts`, `card-chrome.ts`가 생긴 이유). 옮기면서 select 컬럼 목록은 그대로 둔다 — 뷰어는 `id`·`slug`만 쓰지만 목록을 갈라 두면 한쪽만 고쳐진다.

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedScroller } from "@/components/feed/feed-scroller";
import { PostItem } from "@/components/feed/post-item";
import { getChannelVideos } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";

/**
 * 채널 스코프 릴스 뷰어 (IA 개편 결정 7).
 *
 * 릴스 탭(`/reels`)이 전체 영상을 랭킹 순으로 보여준다면 여기는 **한 채널의
 * 영상만** 발행 역순으로 보여준다 — 채널 그리드에서 본 순서 그대로다.
 * 화면은 릴스와 같은 조합(FeedScroller + PostItem)을 재사용하고 데이터
 * 소스와 시작 위치만 다르다.
 *
 * seed를 받지 않는 이유: 랭킹이 없다. 정렬이 published_at desc로 고정이라
 * 재현할 난수가 없고, 그래서 커서도 프리페치도 없다(initialCursor=null).
 */
```

본문은 채널을 slug로 찾고(없으면 `notFound()`), `getChannelVideos`로 목록을 받고, `start` 파라미터로 시작 인덱스를 구한다:

```tsx
  const startId = typeof start === "string" ? start : undefined;
  const startIndex = Math.max(
    0,
    posts.findIndex((p) => p.id === startId),
  );
```

> `findIndex`가 -1이면 `Math.max`가 0으로 만든다 — 지워졌거나 다른 채널의 id를 받아도 첫 영상부터 보여주면 되지, 빈 화면을 주지 않는다.

영상이 하나도 없으면 `notFound()`로 보낸다 — 채널 그리드가 영상이 있을 때만 이 링크를 만들지만, 주소를 직접 치거나 그 사이 게시물이 내려갔을 수 있다.

렌더는 `/reels`와 같되 `initialIndex={startIndex}`를 넘긴다. `TopBar`는 두지 않는다(전면 피드).

- [ ] **Step 2: 채널 그리드의 목적지 분기**

`src/app/(main)/channel/[slug]/page.tsx`의 그리드에서 `href`를 유형에 따라 가른다. 나머지(커버·조회수·포커스 링)는 그대로 둔다.

```tsx
                href={
                  post.type === "video"
                    ? `/channel/${channel.slug}/reels?start=${post.id}`
                    : `/p/${post.id}`
                }
```

그리고 왜 갈리는지 한국어 주석을 단다 — 영상은 그 채널 안에서 이어 보게 하고(결정 7), 카드는 전면 뷰어가 없으므로 상세로 간다.

- [ ] **Step 3: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `64 passed`, 빌드 성공. 라우트 목록에 `/channel/[slug]/reels`가 나온다.

- [ ] **Step 4: 375px에서 확인**

시드에 영상 게시물이 2건뿐이고 한 채널에 몰려 있지 않을 수 있다. **먼저 한 채널에 영상이 3건 이상 있게 만든 뒤** 확인하고, 끝나면 되돌린다.

1. 채널 페이지의 영상 게시물을 탭하면 `/channel/[slug]/reels?start=…`로 간다
2. **탭한 그 영상부터 보인다** (첫 번째가 아니라)
3. 위아래로 넘기면 **그 채널의 영상만** 나온다 — 다른 채널 것도, 카드 게시물도 없다
4. 카드 게시물을 탭하면 여전히 `/p/[postId]`로 간다
5. 뒤로가기로 채널 페이지에 돌아온다
6. 좋아요·댓글·공유·읽기 CTA가 동작한다
7. 상단 바가 없다
8. 존재하지 않는 `start` id를 주면 첫 영상부터 보인다 (빈 화면이 아니다)
9. 영상이 없는 채널의 `/reels` 주소를 직접 치면 404다
10. 릴스 탭(`/reels`)은 이전과 똑같다

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(main)/channel/[slug]/reels/page.tsx" "src/app/(main)/channel/[slug]/page.tsx"
git commit -m "feat(channel): 채널 스코프 릴스 뷰어 — 그 채널의 영상만"
```

---

## Task 3: 문서

**Files:**
- Modify: `docs/prd-ttokttok.md`

- [ ] **Step 1: §4 IA 트리에 라우트 추가**

채널 아래에 `/channel/[slug]/reels`를 넣는다. 채널 페이지가 §4에 어떻게 적혀 있는지 먼저 읽고 그 형식을 따른다.

- [ ] **Step 2: §5.6 급상승 목적지 정정**

§5.6이 지금 "**급상승 그리드**: … 탭 시 해당 게시물부터 시작하는 피드로 진입"이라고 적혀 있다. **코드는 이미 `/p/[postId]`로 간다** — 문서만 낡았다. 설계 결정 10이 정한 것도 상세다. 사실에 맞게 고치고, 왜 피드가 아닌지(피드가 둘로 갈려 어느 쪽인지 모호하고, 가중 랜덤·시드·키셋 커서로 도는 피드를 임의 게시물 위치에 맞추는 것이 상당한 작업이라) 한 줄 남긴다.

- [ ] **Step 3: §5.9 채널 페이지에 뷰어 기록**

채널 그리드의 목적지가 유형에 따라 갈린다는 것과, 영상은 채널 스코프 뷰어로 간다는 것을 적는다.

- [ ] **Step 4: §11 결정 기록**

**마지막 번호를 직접 확인하고** 그다음 번호를 쓴다(추측하지 말 것 — 이 저장소에서 이미 두 번 어긋났다). 담을 것: 입구가 채널 페이지인 이유(홈에 영상이 없고, 릴스 탭 안에서 소스를 바꾸면 뒤로가기·공유가 복잡해진다), 랭킹 대신 발행 역순인 이유(시작 위치가 단순 인덱스가 되고 커서 문제를 피한다), 카드 게시물은 목적지가 안 바뀐다는 것, 급상승은 코드가 이미 맞았고 문서만 고쳤다는 것.

- [ ] **Step 5: 확인**

```bash
grep -n "channel/\[slug\]/reels" docs/prd-ttokttok.md
grep -n "해당 게시물부터 시작하는 피드로 진입" docs/prd-ttokttok.md
```

기대: 첫 번째는 §4·§5.9·§11에서 나온다. 두 번째는 **아무것도 안 나온다**.

- [ ] **Step 6: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 채널 스코프 릴스 뷰어와 급상승 목적지 반영"
```

---

## 4단계 완료 기준

- [ ] `npx vitest run` — 64 passed, 잡음 없음
- [ ] `npm run build` 통과, 라우트 목록에 `/channel/[slug]/reels`
- [ ] Task 2 Step 4의 검증 10항목 (영상 3건 이상인 채널 픽스처로)
- [ ] 릴스 탭·게시물 상세·홈이 이전과 동일 (회귀 없음)
- [ ] PRD §4·§5.6·§5.9·§11이 실제 동작과 일치

## 설계 결정 대조표

| 결정 | 내용 | 구현 위치 |
|---|---|---|
| 7 | 채널 스코프 뷰어의 입구는 채널 페이지 | Task 2 Step 2 |
| 10 | 급상승은 게시물 상세로 | 코드는 이미 그러함 — Task 3 Step 2가 문서를 맞춤 |

## 이 단계에서 하지 않는 것

- **카드 게시물용 전면 뷰어.** 카드는 상세(`/p/[postId]`)가 그 역할이다.
- **채널 뷰어의 페이지네이션.** 30개로 자른다. 넘치면 그때 붙인다(1단계에 키셋 선례가 있다).
- **랭킹 적용.** 발행 역순 고정이다.
- **`get_feed_v4`의 시간 의존 점수 수정.** 별건으로 남아 있다.
- **릴스 탭 안에서 채널로 좁히기.** 설계가 기각한 안이다.
