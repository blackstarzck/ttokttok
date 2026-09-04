# IA 개편 2단계 — 홈 카드 피드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈을 `type='cards'` 전용 카드 피드로 바꾼다. 인스타 포스트 모양 — 채널 헤더 → 본문 → 액션 줄 → 도서 바.

**Architecture:** 게시물 본문은 캐러셀이 아니라 **영역 조합 한 장**이다(§11-41). 그 한 장이 지금은 전면 화면 기준으로 조판돼 있어, 카드 안에 넣으려면 **세이프존 대신 카드 패딩**을 쓰는 모드가 필요하다. 액션 버튼은 전부 크롬(흰색 고정) 스타일에 박혀 있어 카드 표면용 변형이 필요하다 — 로직은 한 벌로 두고 외피만 나눈다. 목록은 전면 피드의 손코딩 페이지네이션을 복제하지 않고 **TanStack Query**로 간다(`docs/FRONTEND.md` §4).

**Tech Stack:** Next.js 16.3.3 App Router / React 19 / Supabase / TanStack Query v5 / Tailwind v4 / Vitest

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-09-04-ia-restructure-design.md` — **결정 1·2·3·4·11**.
- **홈은 `type='cards'`만 보여준다.** `getFeed(..., "cards")`. 영상은 릴스 탭에만 있다.
- **게시물 본문은 한 장이다.** 캐러셀도 인디케이터 도트도 없다 — 2026-08-28 개정에서 버린 모델이다(§11-41, PRD §5.2). 목업에 도트가 있었다면 그건 낡은 §5.1을 읽고 그린 것이고, 이 계획에서는 없다.
- **크롬 예외를 넓히지 말 것.** `chrome.ts`의 흰색 고정 상수들은 **피드 위에 얹히는 오버레이 전용**이다(`docs/DESIGN.md` Colors). 카드 표면 위의 버튼은 시맨틱 토큰을 쓴다 — `chrome.ts`를 import하지 않는다.
- `docs/DESIGN.md:155` verbatim: `터치 타깃 최소 44×44px, 인접 타깃 간 8px 이상.` **두 절 모두.** 예외는 `BottomNav` 하나뿐이고 이 카드에는 해당 없다.
- 최소 글자 크기 12px. 상태를 색으로만 말하지 않는다.
- **접근 가능한 이름은 상태에 따라 바뀌지 않는다.** 이 저장소가 이 부류로 두 번 사고를 냈다 — `aria-label`이 `aria-pressed`와 함께 뒤집힌 적, 조건부 렌더된 스팬의 `aria-label`이 부모 버튼 이름에 흡수된 적.
- 서버 컴포넌트가 기본. `"use client"`는 최소 잎에만. **카드 템플릿 트리를 클라이언트 번들에 넣지 않는다** (`docs/FRONTEND.md` §2·§6) — 서버 액션이 렌더까지 마쳐 보내는 기존 규약을 유지한다.
- 조회 집계는 `record_view(p_post_id uuid, p_session_id text)`. 세는 단위는 **게시물**이다.
- 한국어 주석으로 **왜**를 적는다. 커밋 메시지는 한국어 + Conventional Commits.
- 문서와 코드가 어긋난 채 커밋하지 않는다 (`AGENTS.md` 완료 기준).

---

## File Structure

| 파일 | 책임 | 변경 | 태스크 |
|---|---|---|---|
| `src/components/cards/template-card.tsx` | 카드 모드 (세이프존 대신 카드 패딩) | 수정 | 1 |
| `src/components/feed/like-button.tsx` | 표면용 변형 추가 (로직 공유) | 수정 | 2 |
| `src/components/feed/card-actions.tsx` | 카드 액션 줄 (좋아요·댓글·공유·읽기) | 생성 | 2 |
| `src/components/feed/post-card.tsx` | 인스타 포스트형 카드 한 장 | 생성 | 2 |
| `src/components/feed/card-feed.tsx` | 카드 목록 + 무한 스크롤 + 조회 집계 | 생성 | 3 |
| `src/app/(main)/feed-actions.tsx` | 카드용 렌더 액션 추가 | 수정 | 3 |
| `src/app/(main)/page.tsx` | 홈을 카드 피드로 교체 | 수정 | 3 |
| `docs/prd-ttokttok.md`, `docs/DESIGN.md` | §4·§5.1 갱신, 카드 규격 기록 | 수정 | 3 |

**태스크 순서의 이유**: 본문이 카드 상자에 들어가는지가 이 단계 전체의 전제다. 그게 먼저 확인돼야 카드 껍데기를 만드는 의미가 있고, 카드가 있어야 목록으로 바꿀 수 있다.

---

## Task 1: 본문을 카드 상자에 넣는다

**Files:**
- Modify: `src/components/cards/template-card.tsx`

**Interfaces:**
- Produces: `TemplateCard`에 `variant?: "fullscreen" | "card"` (기본 `"fullscreen"`)

- [ ] **Step 1: 지금 본문이 무엇으로 이루어져 있는지 확인한다**

읽을 것: `src/components/cards/registry.ts`(`POST_TEMPLATES`), `src/components/cards/regions.tsx`, `src/components/feed/chrome.ts`.

템플릿은 둘이다:

- `a` (커버 중심): `cover`, `genre`, `biblio`, `hook`, `desc` — **커버 이미지 + 텍스트 4개**
- `b` (텍스트 중심): `genre`, `hook`, `desc`, `biblio` — 텍스트 4개

지금 조판은 `flex h-full min-h-0 flex-col justify-center gap-4` + `CHROME_SAFE_AREA`(`px-15 pt-16 pb-24`)다. 그 패딩은 **액션 레일과 도서 바를 피하려고** 있는 값이다 — 카드 안에는 피할 것이 없다.

- [ ] **Step 2: 카드 모드를 더한다**

`template-card.tsx`의 시그니처와 래퍼만 바꾼다. 영역 렌더 루프는 손대지 않는다.

```tsx
export function TemplateCard({
  layout,
  book,
  preview = false,
  variant = "fullscreen",
}: {
  layout: FeedCardLayout | null;
  book: FeedBook;
  preview?: boolean;
  /**
   * 이 본문이 놓이는 상자.
   *
   * fullscreen — 전면 피드(릴스·상세·어드민 미리보기). 크롬이 컨텐츠 위에
   *   얹히므로 본문이 CHROME_SAFE_AREA로 스스로 피한다.
   * card — 홈 카드. 피할 크롬이 없다. 세이프존 대신 평범한 카드 패딩을
   *   쓰고, 상자가 낮아 넘칠 수 있으므로 넘침 처리를 카드 쪽에 맡긴다.
   */
  variant?: "fullscreen" | "card";
}) {
```

래퍼:

```tsx
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col justify-center gap-4",
        variant === "card" ? "gap-3 p-4" : CHROME_SAFE_AREA,
      )}
    >
```

> `gap-4` → 카드에서는 `gap-3`. 상자가 낮아지므로 영역 사이 간격을 줄여 본문이 들어갈 여지를 만든다. `cn`이 뒤 값을 이기므로 순서가 중요하다.

- [ ] **Step 3: 실제로 들어가는지 잰다 — 이 태스크의 핵심**

개발 서버를 띄우고 375px에서 잰다. **두 템플릿 모두**, 그리고 **글자 수 상한을 꽉 채운 경우**를 봐야 한다 — 지금 시드 데이터는 짧아서 넘치지 않을 수 있고, 그러면 아무것도 증명하지 못한다.

1. `registry.ts`에서 각 영역의 글자 수 상한(`maxLength`)을 읽는다.
2. 로컬 DB의 `post_cards.body`를 **상한까지 채운** 게시물을 템플릿별로 하나씩 만든다.
3. 4:5 상자(375px 폭 기준 높이 469px)에 `variant="card"`로 렌더해 `scrollHeight`와 `clientHeight`를 잰다.

`PostCard`는 아직 없으므로(Task 2) 임시 상자를 직접 만들어 잰다. 아무 페이지에 아래를 잠깐 넣고 확인한 뒤 지운다:

```tsx
<div id="probe" className="aspect-4/5 w-full overflow-hidden">
  <TemplateCard layout={post.post_cards} book={post.books} variant="card" />
</div>
```

넘치는지 판단은 눈이 아니라 숫자로 한다. 잴 대상은 상자가 아니라 **그 안의 본문**이다 — 상자에 `overflow-hidden`이 있어 상자의 `scrollHeight`는 잘린 뒤 값이라 아무것도 말해주지 않는다:

```js
const box = document.getElementById("probe");
const body = box.firstElementChild;
({
  box: box.clientHeight,
  content: body.scrollHeight,
  overflow: body.scrollHeight - box.clientHeight,
})
```

`overflow`가 0 이하면 들어간 것이다.

- [ ] **Step 4: 넘침을 어떻게 다룰지 정하고 기록한다**

Step 3의 실측 결과에 따라 갈린다. **어느 쪽이든 근거를 한국어 주석으로 남긴다.**

- **안 넘치면**: 아무것도 더하지 않는다. 실측값을 주석에 적는다(템플릿별 최대 높이).
- **넘치면**: 카드 상자를 4:5보다 키운다. 비율을 먼저 조정하고, 그래도 안 되면 영역을 줄인다. **글자 수 상한을 낮추지 말 것** — 그 값은 어드민 편집기와 발행 검증이 공유하므로 낮추면 기존 게시물이 소급해서 잘린다.

넘침을 `overflow-hidden`으로 덮지 않는다. 지금 전면 본문이 그렇게 하고 있고(`2026-09-01-card-text-length-limits-design.md`) 그래서 글자 수 상한이 필요해진 것이다 — 카드에서 같은 실수를 반복하면 상한이 두 벌 필요해진다.

- [ ] **Step 5: 회귀가 없는지 확인한다**

`variant`의 기본값이 `"fullscreen"`이므로 기존 호출부 세 곳(`post-item.tsx`, 어드민 미리보기, `card-placeholder.tsx` 경유)은 한 줄도 안 바뀌어야 한다.

```bash
npx vitest run
npm run build
```

기대: `56 passed`, 빌드 성공.

릴스 탭(`/reels`)과 게시물 상세(`/p/[postId]`)를 열어 **본문이 이전과 똑같은지** 확인한다 — 세이프존 패딩이 그대로여야 한다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/cards/template-card.tsx
git commit -m "feat(cards): 본문에 카드 모드 — 세이프존 대신 카드 패딩"
```

---

## Task 2: 카드 한 장

**Files:**
- Modify: `src/components/feed/like-button.tsx`
- Create: `src/components/feed/card-actions.tsx`
- Create: `src/components/feed/post-card.tsx`

**Interfaces:**
- Consumes: Task 1의 `TemplateCard variant="card"`
- Produces:
  - `LikeButton`에 `surface?: boolean` (기본 false = 크롬)
  - `CardActions({ post, liked, isGuest, userId })`
  - `PostCard({ post, liked, isGuest, userId })`

- [ ] **Step 1: `LikeButton`에 표면 변형을 더한다**

지금 `LikeButton`은 `CHROME_ACTION`·`CHROME_ICON`·`CHROME_COUNT`에 박혀 있다. 낙관적 갱신·게스트 분기·RPC 로직은 그대로 두고 **클래스만** 갈라낸다 — 로직을 복제하면 한쪽만 고쳐지고, 이 저장소엔 이미 그 전례가 있다(`nextLikeState`가 댓글 좋아요와 공유되지 않는 것).

props에 추가:

```tsx
  /**
   * 카드 표면 위에 놓이는지. 크롬(흰색 고정)은 피드 위에 얹히는 오버레이
   * 전용 예외라(DESIGN.md Colors) 카드에서는 시맨틱 토큰을 써야 한다.
   * 로직은 한 벌이고 외피만 갈라진다.
   */
  surface?: boolean;
```

파일 상단에 표면용 클래스를 둔다:

```tsx
const SURFACE_ACTION =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";
const SURFACE_ICON = "size-5";
const SURFACE_COUNT = "text-xs tabular-nums";
```

두 군데의 `className={CHROME_ACTION}`을 `className={surface ? SURFACE_ACTION : CHROME_ACTION}`으로, 아이콘·카운트도 같은 방식으로 바꾼다. `aria-label="좋아요"`는 **그대로 둔다** — 상태에 따라 바뀌면 안 된다.

- [ ] **Step 2: 카드 액션 줄**

`src/components/feed/card-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Info, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { BookSheet } from "@/components/book/book-sheet";
import { LoginSheet } from "@/components/auth/login-sheet";
import { LikeButton } from "@/components/feed/like-button";
import { CommentSheet } from "@/components/feed/comment-sheet";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { formatCount } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";

const ACTION =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none";
const COUNT = "text-xs tabular-nums";

/**
 * 카드 액션 줄 (IA 개편 결정 4).
 *
 * 전면 피드의 세로 레일(ActionBar)과 같은 동작을 가로로 편 것이다.
 * 레일을 재사용하지 않는 이유: 레일은 흰색 고정 크롬이고 그 예외는
 * 오버레이 전용이다(DESIGN.md Colors). 카드 표면 위에서는 시맨틱 토큰을
 * 써야 하므로 외피가 다르다.
 *
 * 읽기가 오른쪽 끝에서 유일하게 글자 붙은 채운 버튼이다 — 홈이 기본
 * 탭이 되면서 숏폼→뷰어 전환을 이 버튼이 짊어지기 때문이다(결정 2).
 * 전면 피드에서는 채운 원형 아이콘으로 위계를 잡았지만, 카드에는 주변
 * 요소가 많아 아이콘만으로는 묻힌다.
 *
 * gap-2 = 8px. DESIGN.md는 44×44와 함께 "인접 타깃 간 8px 이상"을 함께
 * 규정한다 — 이 저장소가 그 절을 두 번 놓쳤다.
 */
export function CardActions({
  post,
  liked,
  isGuest,
  userId,
}: {
  post: FeedPost;
  liked: boolean;
  isGuest: boolean;
  userId: string | null;
}) {
  const [shareCount, setShareCount] = useState(post.share_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);

  async function handleShare() {
    const url = `${window.location.origin}/p/${post.id}`;
    const title = `${post.books.title} · ${post.books.author}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크를 복사했어요");
      }
    } catch {
      return; // 사용자가 공유 시트를 닫은 경우 — 집계하지 않는다.
    }

    setShareCount((n) => n + 1);
    void track("share", { postId: post.id, bookId: post.books.id });

    const { error } = await createClient().rpc("record_share", {
      p_post_id: post.id,
    });
    if (error) {
      setShareCount((n) => Math.max(n - 1, 0));
      toast.error("공유 집계에 실패했어요");
    }
  }

  const commentButton = (
    <button type="button" aria-label="댓글" className={ACTION}>
      <MessageCircle className="size-5" aria-hidden />
      <span className={COUNT}>{formatCount(commentCount)}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-2 px-2">
      <LikeButton
        postId={post.id}
        count={post.like_count}
        liked={liked}
        isGuest={isGuest}
        surface
      />

      {isGuest ? (
        <LoginSheet reason="로그인하면 댓글을 남길 수 있어요.">
          {commentButton}
        </LoginSheet>
      ) : (
        <CommentSheet
          postId={post.id}
          currentUserId={userId!}
          onAdded={() => setCommentCount((n) => n + 1)}
        >
          {commentButton}
        </CommentSheet>
      )}

      <button
        type="button"
        onClick={handleShare}
        aria-label="공유"
        className={ACTION}
      >
        <Share2 className="size-5" aria-hidden />
        <span className={COUNT}>{formatCount(shareCount)}</span>
      </button>

      {/* 전문 도서는 뷰어로 직행, 링크형은 도서 상세 시트로 (PRD §11-31) */}
      {post.books.epub_path !== null ? (
        <Link
          href={`/read/${post.books.id}`}
          aria-label={`${post.books.title} 바로 읽기`}
          className="bg-foreground text-background focus-visible:ring-ring ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        >
          <BookOpen className="size-4" aria-hidden />
          읽기
        </Link>
      ) : (
        <BookSheet book={post.books} isGuest={isGuest}>
          <button
            type="button"
            aria-label={`${post.books.title} 도서 정보 보기`}
            className="bg-foreground text-background focus-visible:ring-ring ml-auto flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Info className="size-4" aria-hidden />
            도서
          </button>
        </BookSheet>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 카드 한 장**

`src/components/feed/post-card.tsx`. 서버 컴포넌트다 — `"use client"`를 붙이지 않는다. 본문 트리가 클라이언트 번들로 넘어가면 안 되기 때문이다.

```tsx
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TemplateCard } from "@/components/cards/template-card";
import { BookCover } from "@/components/feed/book-cover";
import { BookSheet } from "@/components/book/book-sheet";
import { CardActions } from "@/components/feed/card-actions";
import { formatByline } from "@/lib/format";
import type { FeedPost } from "@/lib/feed";

/**
 * 홈 피드의 카드 한 장 (IA 개편 결정 3).
 *
 * 위에서 아래로 채널 헤더 → 본문 → 액션 줄 → 도서 바. 전면 피드가
 * 오버레이인 것과 달리 여기는 **쌓기**다 — 크롬이 컨텐츠를 가리지 않으므로
 * 스크림도 세이프존도 필요 없다.
 *
 * 본문 비율은 4:5다. 근거와 실측은 template-card.tsx의 카드 모드 주석.
 */
export function PostCard({
  post,
  liked = false,
  isGuest = true,
  userId = null,
}: {
  post: FeedPost;
  liked?: boolean;
  isGuest?: boolean;
  userId?: string | null;
}) {
  const byline = formatByline(post.books);

  return (
    <article className="border-border bg-card overflow-hidden rounded-xl border">
      <Link
        href={`/channel/${post.channels.slug}`}
        className="focus-visible:ring-ring flex min-h-11 items-center gap-2 px-3 focus-visible:ring-2 focus-visible:outline-none"
      >
        <Avatar className="size-7">
          {post.channels.avatar_url ? (
            <AvatarImage src={post.channels.avatar_url} alt="" />
          ) : null}
          <AvatarFallback className="text-xs">
            {post.channels.name.slice(0, 1)}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">
          {post.channels.name}
        </span>
      </Link>

      <div data-card-body className="bg-background aspect-4/5 overflow-hidden">
        <TemplateCard layout={post.post_cards} book={post.books} variant="card" />
      </div>

      <div className="py-1">
        <CardActions
          post={post}
          liked={liked}
          isGuest={isGuest}
          userId={userId}
        />
      </div>

      <BookSheet book={post.books} isGuest={isGuest}>
        <button
          type="button"
          aria-label={`${post.books.title} 도서 정보`}
          className="focus-visible:ring-ring flex w-full items-center gap-3 px-3 pb-3 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <BookCover book={post.books} className="w-9 shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium break-keep">
              {post.books.title}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {byline}
            </span>
          </span>
        </button>
      </BookSheet>
    </article>
  );
}
```

- [ ] **Step 4: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `56 passed`, 빌드 성공. 이 단계는 순수 함수를 더하지 않으므로 개수가 그대로다 — **빈 테스트로 개수를 채우지 않는다**(`docs/FRONTEND.md` §7).

- [ ] **Step 5: 375px에서 카드 하나를 확인한다**

아직 홈은 안 바꿨으므로, 임시 라우트나 상세 페이지에 `PostCard`를 하나 렌더해 본다. 확인 후 임시 코드는 지운다.

1. 채널 헤더 → 본문 → 액션 줄 → 도서 바 순서로 쌓인다
2. 본문이 4:5 상자 안에 들어가고 잘리지 않는다 (Task 1 Step 3과 같은 방식으로 실측)
3. 좋아요·댓글·공유가 **흰색이 아니라 시맨틱 토큰** 색으로 보인다 (라이트·다크 둘 다)
4. 읽기 버튼이 글자와 함께 오른쪽 끝에 있고, 링크형 도서면 "도서"로 바뀐다
5. 액션 버튼이 44×44 이상이고 **인접 간격이 8px 이상** (실측)
6. 좋아요를 눌러도 `aria-label`이 "좋아요" 그대로고 `aria-pressed`만 바뀐다
7. 게스트로 댓글을 누르면 로그인 시트가 뜬다
8. 채널 헤더·도서 바가 각각 채널 페이지·도서 시트로 간다

- [ ] **Step 6: 커밋**

```bash
git add src/components/feed/like-button.tsx src/components/feed/card-actions.tsx src/components/feed/post-card.tsx
git commit -m "feat(feed): 홈 카드 한 장 — 인스타 포스트형"
```

---

## Task 3: 홈을 카드 피드로 교체

**Files:**
- Modify: `src/app/(main)/feed-actions.tsx`
- Create: `src/components/feed/card-feed.tsx`
- Modify: `src/app/(main)/page.tsx`
- Modify: `docs/prd-ttokttok.md`, `docs/DESIGN.md`

**Interfaces:**
- Consumes: Task 2의 `PostCard`
- Produces: `loadMoreCards(seed, sessionId, cursor)`, `CardFeed({ initialNodes, initialPostIds, seed, initialCursor })`

- [ ] **Step 1: 카드용 서버 액션**

`feed-actions.tsx`에 더한다. 기존 `loadMoreFeed`는 릴스가 쓰므로 **건드리지 않는다**.

```tsx
/**
 * 홈 카드 피드의 다음 페이지.
 *
 * loadMoreFeed와 나눠 둔 이유: 렌더하는 컴포넌트가 다르다(PostCard vs
 * PostItem). JSX를 그대로 돌려주는 규약은 같다 — 클라이언트가 데이터를
 * 받아 직접 그리면 카드 템플릿과 zod까지 클라이언트 번들로 넘어간다
 * (FRONTEND.md §2·§6).
 */
export async function loadMoreCards(
  seed: string,
  sessionId: string | null,
  cursor: FeedCursor | null,
): Promise<MoreFeed> {
  const { posts, nextCursor } = await getFeed(seed, sessionId, 10, cursor, "cards");

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);

  return {
    nodes: posts.map((post) => (
      <PostCard
        key={post.id}
        post={post}
        liked={likedIds.has(post.id)}
        isGuest={user === null}
        userId={user?.id ?? null}
      />
    )),
    postIds: posts.map((p) => p.id),
    nextCursor,
  };
}
```

`PostCard` import를 파일 상단에 더한다.

- [ ] **Step 2: 카드 목록**

`src/components/feed/card-feed.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";
import { loadMoreCards } from "@/app/(main)/feed-actions";
import type { FeedCursor } from "@/lib/feed";
import type { MoreFeed } from "@/app/(main)/feed-actions";

/** 조회로 집계하기까지 뷰포트에 머물러야 하는 시간 (PRD §5.1). */
const VIEW_DWELL_MS = 1000;

/**
 * 홈 카드 목록 (IA 개편 결정 1·11).
 *
 * 전면 피드(FeedScroller)의 손코딩 페이지네이션을 복제하지 않고 TanStack
 * Query를 쓴다 — FRONTEND.md §4가 피드 페이지네이션을 그쪽 몫으로 지정하고
 * 있고, FeedScroller가 그 규칙을 어긴 자리에서 "가드가 자기 요청을
 * 취소해 다음 페이지가 영영 안 붙던" 버그가 나왔다.
 *
 * 서버가 렌더를 마친 JSX를 페이지 단위로 받는다. 첫 페이지는 서버
 * 컴포넌트가 넘겨준 것을 initialData로 쓴다.
 */
export function CardFeed({
  initialNodes,
  initialPostIds,
  seed,
  initialCursor,
}: {
  initialNodes: React.ReactNode[];
  initialPostIds: string[];
  seed: string;
  initialCursor: FeedCursor | null;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loggedRef = useRef(new Set<string>());

  const query = useInfiniteQuery<MoreFeed>({
    queryKey: ["home-cards", seed],
    queryFn: ({ pageParam }) =>
      loadMoreCards(seed, getSessionId(), pageParam as FeedCursor | null),
    initialPageParam: initialCursor,
    getNextPageParam: (last) => last.nextCursor,
    initialData: {
      pages: [
        { nodes: initialNodes, postIds: initialPostIds, nextCursor: initialCursor },
      ],
      pageParams: [null],
    },
  });

  // 바닥에 닿으면 다음 페이지. IntersectionObserver라 스크롤 이벤트를
  // 매 프레임 듣지 않는다.
  //
  // deps에 query 객체를 통째로 넣지 말 것 — 매 렌더 새 객체라 옵저버가
  // 렌더마다 해제·재생성된다. 값 셋만 넣는다(fetchNextPage는 TanStack
  // Query가 안정적으로 유지한다). FeedScroller가 상태를 가드이자
  // 의존성으로 함께 써서 자기 요청을 취소하던 버그와 같은 부류다.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const nodes = query.data?.pages.flatMap((p) => p.nodes) ?? [];
  const postIds = query.data?.pages.flatMap((p) => p.postIds) ?? [];

  // 조회 집계 — 1초 이상 보이면 게시물당 한 번. 세는 단위는 게시물이라
  // 카드 하나가 곧 한 번이다(설계 결정 11).
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>("[data-post-id]");
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.postId;
          if (!id) continue;

          if (entry.isIntersecting) {
            if (loggedRef.current.has(id) || timers.has(id)) continue;
            timers.set(
              id,
              setTimeout(() => {
                timers.delete(id);
                loggedRef.current.add(id);
                void createClient()
                  .rpc("record_view", { p_post_id: id, p_session_id: getSessionId() })
                  .then(({ error }) => {
                    if (error) loggedRef.current.delete(id); // 다음 기회에 재시도
                  });
              }, VIEW_DWELL_MS),
            );
          } else {
            const t = timers.get(id);
            if (t) {
              clearTimeout(t);
              timers.delete(id);
            }
          }
        }
      },
      { threshold: 0.5 },
    );

    cards.forEach((c) => io.observe(c));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [postIds.length]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {nodes.map((node, i) => (
        <div key={postIds[i] ?? i} data-post-id={postIds[i]}>
          {node}
        </div>
      ))}

      <div ref={sentinelRef} className="h-1" aria-hidden />

      {isFetchingNextPage ? (
        <div className="flex justify-center py-4">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden />
          <span className="sr-only">다음 게시물을 불러오는 중</span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: 홈 교체**

`src/app/(main)/page.tsx`를 카드 피드로 바꾼다. `TopBar`는 **이 단계에서 그대로 둔다** — 구조적 헤더로 바꾸는 것은 3단계다(결정 8).

```tsx
import { cookies } from "next/headers";
import { CardFeed } from "@/components/feed/card-feed";
import { PostCard } from "@/components/feed/post-card";
import { TopBar } from "@/components/feed/top-bar";
import { getFeed } from "@/lib/feed";
import { getCurrentUser, getLikedPostIds } from "@/lib/auth";
import { FEED_SEED_COOKIE } from "@/lib/feed-seed";

export default async function HomePage() {
  const jar = await cookies();
  const seed = jar.get(FEED_SEED_COOKIE)?.value ?? crypto.randomUUID();

  // 홈은 카드 게시물만 (IA 개편 결정 1). 영상은 릴스 탭에 있다.
  const { posts, nextCursor } = await getFeed(seed, null, 10, null, "cards");

  const [user, likedIds] = await Promise.all([
    getCurrentUser(),
    getLikedPostIds(posts.map((p) => p.id)),
  ]);
  const isGuest = user === null;

  return (
    <div className="relative h-full">
      <CardFeed
        seed={seed}
        initialCursor={nextCursor}
        initialPostIds={posts.map((p) => p.id)}
        initialNodes={posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            liked={likedIds.has(post.id)}
            isGuest={isGuest}
            userId={user?.id ?? null}
          />
        ))}
      />
      <TopBar isGuest={isGuest} />
    </div>
  );
}
```

> 카드 피드는 스냅이 아니므로 상단 바가 컨텐츠를 가린다. 3단계가 구조적 헤더로 바꾸며 해소한다. **이 단계에서 먼저 바꾸지 않는다** — 릴스가 아직 같은 크롬 상수를 공유하고 있어 함께 움직여야 한다.

- [ ] **Step 4: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `56 passed`, 빌드 성공.

- [ ] **Step 5: 375px에서 확인**

카드 게시물이 10개를 넘어야 페이지네이션이 실제로 돈다. **부족하면 기존 카드 게시물 행을 복제해 14개 이상으로 만든 뒤** 확인하고, 끝나면 지운다.

1. 홈에 **카드 게시물만** 보인다 — 영상이 하나도 안 섞인다
2. 세로로 스크롤되고 스냅이 걸리지 않는다
3. 바닥에 닿으면 다음 페이지가 붙는다. **중복 게시물이 없다**
4. 스피너가 끝에서 멈춰 있지 않다
5. 카드를 1초 이상 보면 조회가 1회 기록된다 — 같은 카드를 다시 봐도 세션 안에서 다시 세지 않는다 (DB로 확인)
6. 릴스 탭이 이전과 똑같이 동작한다
7. 게시물 상세(`/p/[postId]`)가 이전과 똑같다 — 전면 본문에 세이프존이 그대로다
8. 라이트·다크 모두에서 카드 표면과 액션 색이 맞다

- [ ] **Step 6: 문서 갱신**

- **PRD §4**: 홈 줄의 "세로 스크롤 숏폼 피드"를 카드 피드로 고친다.
- **PRD §5.1**: 홈이 이제 `type='cards'`를 넘긴다는 사실로 고친다. 1단계에서 넣은 "홈은 아직 널을 넘긴다" 문단과 **조회 중복 문단을 지운다** — 게시물이 한 탭에만 있게 되어 사라진 문제다.
- **PRD §5.1**에 카드 구조(채널 헤더 → 본문 4:5 → 액션 줄 → 도서 바)와 읽기 CTA가 글자 붙은 버튼이라는 것을 적는다.
- **DESIGN.md**: 카드 본문 비율과 패딩을 기록한다. 크롬 예외가 **카드에는 적용되지 않는다**는 것을 명시한다.

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(main)/feed-actions.tsx" src/components/feed/card-feed.tsx "src/app/(main)/page.tsx" docs/prd-ttokttok.md docs/DESIGN.md
git commit -m "feat(home): 홈을 카드 피드로 교체 — 카드 게시물 전용"
```

---

## 2단계 완료 기준

- [ ] `npx vitest run` — 56 passed, 잡음 없음
- [ ] `npm run build` 통과
- [ ] Task 1 Step 3의 본문 넘침 실측 (템플릿 a·b, 글자 수 상한까지 채운 데이터)
- [ ] Task 2 Step 5의 카드 검증 8항목
- [ ] Task 3 Step 5의 피드 검증 8항목
- [ ] 릴스와 게시물 상세가 이전과 동일 (회귀 없음)
- [ ] PRD §4·§5.1, DESIGN.md가 실제 동작과 일치

## 설계 결정 대조표

| 결정 | 내용 | 구현 위치 |
|---|---|---|
| 1 | 홈은 `type='cards'`만 | Task 3 Step 1·3 |
| 2 | 기본 탭이 홈 → 읽기 CTA가 전환을 짊어짐 | Task 2 Step 2 |
| 3 | 인스타 포스트형 카드 | Task 2 Step 3 |
| 4 | 읽기는 글자 붙은 버튼 | Task 2 Step 2 |
| 11 | 조회 로깅을 홈 카드에도 | Task 3 Step 2 |

## 이 단계에서 하지 않는 것

- **상단 바를 구조적 헤더로 바꾸기.** 3단계다. 릴스가 같은 크롬 상수를 공유하므로 함께 움직여야 한다.
- **릴스 크롬 되돌리기.** 3단계다.
- **채널 스코프 릴스 뷰어, 급상승 목적지 변경.** 4단계다.
- **`FeedScroller` 리팩터.** 릴스가 그대로 쓴다. 손코딩 페이지네이션은 이월 항목이고, 새 카드 피드가 TanStack Query 쪽 선례를 만든다.
- **글자 수 상한 낮추기.** 어드민 편집기·발행 검증과 공유하는 값이라 낮추면 기존 게시물이 소급해서 잘린다.
