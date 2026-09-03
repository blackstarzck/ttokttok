# 댓글 좋아요 (2단계) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 댓글과 답글에 좋아요를 붙인다 — 카운트는 트리거가, 내가 눌렀는지는 RLS가 관리한다.

**Architecture:** `comment_likes` 조인 테이블 + `comments.like_count` 비정규화 컬럼 + 트리거. 기존 게시물 좋아요(`likes` / `sync_like_count` / `likes_select_own`)의 규약을 그대로 복제한다 — 이미 검증된 패턴이고, 두 좋아요가 다른 모양이면 나중에 한쪽만 고쳐진다. "내가 눌렀는지"는 1단계의 `withReplyCounts`와 같은 방식(페이지의 id들로 두 번째 조회 + 순수 함수로 접기)으로 구한다.

**Tech Stack:** Next.js 16.3.3 App Router / React 19 / Supabase Postgres + PostgREST / TanStack Query v5 / Vitest / Tailwind v4 / shadcn-ui

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-09-02-comment-threads-design.md` — **결정 11**(댓글 좋아요 추가, 답글에도 붙임).
- 1단계(`2026-09-02-comment-threads.md`)가 확정한 것 위에 얹는다. 캐시 키는 `["comments", postId]`와 `["replies", commentId]`, 둘 다 `useInfiniteQuery`다.
- **카운터는 트리거만이 증감 경로다** (`docs/FRONTEND.md` §5). 클라이언트가 `comments.like_count`를 직접 update하지 않는다.
- **테스트는 순수 함수만.** Supabase 쿼리 빌더를 모킹하지 않는다 — 모킹한 체인을 검증하는 테스트는 모킹한 모양을 검증할 뿐이다 (`docs/FRONTEND.md` §7).
- 검증은 세 겹: `npx vitest run` + `npm run build` + 375px 수동 확인. 마이그레이션은 로컬 Supabase에 적용해 SQL로 실증한다.
- 스타일은 **시맨틱 토큰만**. 원시 hex·px·Tailwind 팔레트 직접 참조 금지.
- 댓글 시트는 **피드 크롬이 아니다** — `@/components/feed/chrome`를 import하지 않는다.
- **좋아요 상태는 색이 아니라 채움으로 구분한다** (`docs/DESIGN.md` Colors: "좋아요한 하트는 빨강이 아니라 **채움**으로 구분한다 — 유채색은 도서 표지의 몫이고, 색맹 사용자에게도 형태가 더 확실하다").
- 터치 타깃 44×44px 이상, 아이콘 단독 버튼에 `aria-label`, 텍스트 12px 미만 금지.
- 서버 상태 = TanStack Query / UI 상태 = `useState`. 전역 스토어 금지.
- 클라이언트 컴포넌트는 `@/lib/supabase/client`만 쓴다.
- 마이그레이션 파일명은 `YYYYMMDDNNNNNN_<name>.sql`. 직전 파일은 `20260902000001_comment_threads.sql`.
- 커밋 메시지는 한국어 + Conventional Commits.

---

## File Structure

| 파일 | 책임 | 변경 | 태스크 |
|---|---|---|---|
| `supabase/migrations/20260903000001_comment_likes.sql` | `comment_likes` 테이블·`like_count` 컬럼·트리거·RLS | 생성 | 1 |
| `src/lib/comments.ts` | `Comment`에 좋아요 필드, 조회에 좋아요 상태 병합, 토글 함수 | 수정 | 2 |
| `src/lib/comments.test.ts` | `likedIdSet` 단위 테스트 | 수정 | 2 |
| `src/lib/comment-cache.ts` | 낙관적 행에 좋아요 초기값 | 수정 | 2 |
| `src/lib/comment-like.ts` | 좋아요 토글의 순수 계산 — React·네트워크 의존 없음 | 생성 | 3 |
| `src/lib/comment-like.test.ts` | 토글 계산 단위 테스트 | 생성 | 3 |
| `src/components/feed/comment-like-button.tsx` | 하트 버튼 한 개 (낙관적 토글) | 생성 | 3 |
| `src/components/feed/comment-item.tsx` | 행 액션 줄에 하트 배치 | 수정 | 3 |
| `docs/prd-ttokttok.md` | §5.5·§6·§11·v2 백로그 | 수정 | 4 |

`comment-like.ts`를 따로 두는 이유: 토글의 산술(눌렀다 뗐을 때 카운트가 제자리로 돌아오는가, 0 아래로 내려가지 않는가)이 이 기능에서 유일하게 틀리기 쉬운 순수 로직이다. 버튼 안에 인라인으로 두면 검증 수단이 렌더뿐이다.

`comment-like-button.tsx`를 `like-button.tsx`와 합치지 않는 이유: 후자는 **피드 크롬**(흰색 고정, `chrome.ts` import)이고 전자는 시트 안(테마 토큰)이다. DESIGN.md가 크롬을 명시적 예외 구역으로 못박아 두었으므로, 한 컴포넌트가 두 색 체계를 boolean prop으로 오가면 그 경계가 무너진다 (`FRONTEND.md` §2: boolean prop 증가는 설계 오류 신호).

---

## Task 1: 스키마 — comment_likes · like_count · 트리거

**Files:**
- Create: `supabase/migrations/20260903000001_comment_likes.sql`

**Interfaces:**
- Produces: `public.comment_likes (user_id, comment_id)`, `comments.like_count int not null default 0`, 트리거 `on_comment_like_change`, RLS 정책 3개

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260903000001_comment_likes.sql` 전체 내용:

```sql
-- ============================================================
-- 댓글 좋아요 (설계 결정 11)
--
-- 게시물 좋아요(likes / sync_like_count / likes_select_own)의 규약을
-- 그대로 복제한다. 두 좋아요가 다른 모양이면 나중에 한쪽만 고쳐진다.
--
-- 답글에도 붙는다 — comment_likes는 comments를 가리킬 뿐 최상위인지
-- 답글인지 구분하지 않는다.
-- ============================================================

alter table public.comments
  add column like_count int not null default 0;

create table public.comment_likes (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  comment_id uuid not null
    references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- "이 페이지의 댓글들 중 내가 누른 것"을 한 번에 조회한다.
-- PK가 (user_id, comment_id)라 user_id 고정 + comment_id IN (...) 을 그대로 받는다.
-- 별도 인덱스를 만들지 않는 이유가 이것이다.

alter table public.comment_likes enable row level security;

-- likes와 같은 형태: 내 좋아요 여부 확인은 본인 행만, 토글도 본인만.
-- 남의 좋아요를 셀 필요가 없다 — 총계는 like_count가 답한다.
create policy "comment_likes_select_own" on public.comment_likes
  for select using (auth.uid() = user_id);
create policy "comment_likes_insert_own" on public.comment_likes
  for insert with check (auth.uid() = user_id);
create policy "comment_likes_delete_own" on public.comment_likes
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 카운터. sync_like_count와 같은 구조다.
-- security definer인 이유: 좋아요를 누른 사람이 comments를 update할
-- 권한은 없다(comments_soft_delete는 본인 댓글만). 카운터는 트리거만이
-- 올리고 내린다.
-- ------------------------------------------------------------
create function public.sync_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    update public.comments
       set like_count = like_count + 1
     where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.comments
       set like_count = greatest(like_count - 1, 0)
     where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$fn$;

create trigger on_comment_like_change
  after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_like_count();
```

> `like_count`를 감소시킬 때 `greatest(..., 0)`을 쓰는 이유는 `sync_like_count`와 같다 — 카운터가 음수가 되면 UI가 "-1"을 그린다. 방어이지 정상 경로가 아니다.

- [ ] **Step 2: 로컬 DB에 적용**

```bash
npx supabase db reset
```

기대: 마이그레이션 16개가 오류 없이 적용되고 마지막이 `20260903000001_comment_likes.sql`이다.

- [ ] **Step 3: 카운터를 SQL로 검증**

`npm run seed`로 시드를 넣고, Auth 관리자 API로 사용자를 만든 뒤 실행한다. `<comment>`·`<user>`는 실제 값으로 치환한다.

```sql
begin;

insert into public.comments (post_id, user_id, content)
select id, '<user>', 'like-target' from public.posts limit 1;

select like_count as before_count from public.comments where content = 'like-target';

insert into public.comment_likes (user_id, comment_id)
select '<user>', id from public.comments where content = 'like-target';

select like_count as after_insert from public.comments where content = 'like-target';

delete from public.comment_likes
 where comment_id = (select id from public.comments where content = 'like-target');

select like_count as after_delete from public.comments where content = 'like-target';

rollback;
```

기대: `before_count = 0`, `after_insert = 1`, `after_delete = 0`.

- [ ] **Step 4: 중복 좋아요가 막히는지 검증**

```sql
begin;

insert into public.comments (post_id, user_id, content)
select id, '<user>', 'dup-target' from public.posts limit 1;

insert into public.comment_likes (user_id, comment_id)
select '<user>', id from public.comments where content = 'dup-target';

-- 아래는 PK 충돌로 반드시 실패해야 한다
insert into public.comment_likes (user_id, comment_id)
select '<user>', id from public.comments where content = 'dup-target';

rollback;
```

기대: 두 번째 INSERT가 `duplicate key value violates unique constraint` 로 거부된다. 성공하면 카운트가 두 번 올라가는 결함이 있다는 뜻이다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260903000001_comment_likes.sql
git commit -m "feat(db): 댓글 좋아요 테이블·카운터 트리거 추가"
```

---

## Task 2: 데이터 계층 — 좋아요 상태 병합

**Files:**
- Modify: `src/lib/comments.ts` — `Comment` 타입, `COMMENT_SELECT`, `fetchCommentPage`, `fetchReplyPage`, 새 함수 2개
- Modify: `src/lib/comments.test.ts` — `likedIdSet` 테스트 추가
- Modify: `src/lib/comment-cache.ts` — `makeOptimisticComment`에 좋아요 초기값

**Interfaces:**
- Consumes: Task 1의 `comment_likes`, `comments.like_count`
- Produces:
  - `Comment`에 `like_count: number`, `liked: boolean` 추가
  - `likedIdSet(rows: { comment_id: string }[]): Set<string>`
  - `toggleCommentLike(commentId: string, next: boolean): Promise<void>`
- 시그니처가 바뀌지 않는 것: `fetchCommentPage`, `fetchReplyPage`, `toCursor`, `countRepliesByParent`, `addComment`, `removeComment`, `reportComment`, `commentErrorMessage`, `timeAgo`

- [ ] **Step 1: `Comment` 타입과 SELECT를 넓힌다**

`src/lib/comments.ts`의 `Comment` 타입에 두 필드를 더한다:

```ts
export type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  /** 살아 있는 답글 수. 최상위 댓글에만 의미가 있다 (답글은 항상 0). */
  reply_count: number;
  /** 비정규화 카운터. 트리거만이 증감한다. */
  like_count: number;
  /** 내가 눌렀는지. RLS가 본인 행만 돌려주므로 존재 여부가 곧 답이다. */
  liked: boolean;
  profiles: { nickname: string; avatar_url: string | null } | null;
};
```

`COMMENT_SELECT`에 `like_count`를 더한다:

```ts
const COMMENT_SELECT =
  "id, content, created_at, user_id, parent_id, like_count, profiles ( nickname, avatar_url )";
```

- [ ] **Step 2: 실패하는 테스트를 먼저 쓴다 (RED)**

`src/lib/comments.test.ts`의 import에 `likedIdSet`을 더하고, 파일 끝에 블록을 추가한다:

```ts
describe("likedIdSet", () => {
  it("행들을 id 집합으로 접는다", () => {
    const s = likedIdSet([{ comment_id: "a" }, { comment_id: "b" }]);
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("빈 입력은 빈 집합", () => {
    expect(likedIdSet([]).size).toBe(0);
  });

  it("없는 id는 false — 호출부가 그대로 liked로 쓴다", () => {
    const s = likedIdSet([{ comment_id: "a" }]);
    expect(s.has("zzz")).toBe(false);
  });

  it("같은 id가 중복돼도 집합이라 한 번만 센다", () => {
    const s = likedIdSet([{ comment_id: "a" }, { comment_id: "a" }]);
    expect(s.size).toBe(1);
  });
});
```

- [ ] **Step 3: 실패를 확인한다 (RED)**

```bash
npx vitest run src/lib/comments.test.ts
```

기대: `likedIdSet is not a function` 또는 import 해결 실패로 실패한다.

- [ ] **Step 4: `likedIdSet`과 `withLikeState`를 구현한다 (GREEN)**

`countRepliesByParent` 아래에 넣는다:

```ts
/**
 * comment_likes 행들을 id 집합으로 접는다. 네트워크에서 떼어낸 순수
 * 함수라 단위 테스트 대상이다 — 이 집합이 틀리면 하트의 채움이 틀린다.
 */
export function likedIdSet(rows: { comment_id: string }[]): Set<string> {
  return new Set(rows.map((r) => r.comment_id));
}

/**
 * 이 페이지의 댓글들 중 내가 좋아요한 것을 한 번에 표시한다.
 *
 * user_id로 거르지 않는 이유: comment_likes_select_own 정책이 이미 본인
 * 행만 돌려준다. 프론트에서 권한 분기로 보안을 흉내 내지 않는다
 * (FRONTEND.md §5). 비로그인은 시트에 도달하지 못하므로(ActionBar가
 * LoginSheet로 분기) 빈 집합 경로만 남는다.
 *
 * 답글 수(withReplyCounts)와 같은 모양이다 — 페이지의 id들로 두 번째
 * 조회를 하고 순수 함수로 접는다.
 */
async function withLikeState(
  db: ReturnType<typeof createClient>,
  rows: Omit<Comment, "liked">[],
): Promise<Comment[]> {
  if (!rows.length) return [];

  const { data, error } = await db
    .from("comment_likes")
    .select("comment_id")
    .in(
      "comment_id",
      rows.map((r) => r.id),
    );

  if (error) throw new Error(error.message);

  const liked = likedIdSet((data ?? []) as { comment_id: string }[]);
  return rows.map((r) => ({ ...r, liked: liked.has(r.id) }));
}
```

- [ ] **Step 5: 두 조회 함수에 병합을 끼운다**

`fetchCommentPage`의 마지막 세 줄을 바꾼다:

```ts
  const rows = (data ?? []) as unknown as Omit<
    Comment,
    "reply_count" | "liked"
  >[];
  const withCounts = await withReplyCounts(db, rows);
  const items = await withLikeState(db, withCounts);
  return { items, cursor: toCursor(items, COMMENT_PAGE_SIZE) };
```

`withReplyCounts`의 시그니처를 좋아요 필드가 아직 없는 상태에 맞춘다:

```ts
async function withReplyCounts(
  db: ReturnType<typeof createClient>,
  rows: Omit<Comment, "reply_count" | "liked">[],
): Promise<Omit<Comment, "liked">[]> {
```

`fetchReplyPage`의 마지막 부분을 바꾼다 — 답글은 자식이 없으므로 `reply_count`는 0으로 채우고 좋아요만 병합한다:

```ts
  const db = createClient();
  // …기존 쿼리…
  const withCounts = ((data ?? []) as unknown as Omit<
    Comment,
    "reply_count" | "liked"
  >[]).map((r) => ({ ...r, reply_count: 0 }));
  const items = await withLikeState(db, withCounts);
  return { items, cursor: toCursor(items, REPLY_PAGE_SIZE) };
```

`fetchReplyPage`가 지금 `createClient()`를 인라인으로 쓰고 있다면 위처럼 `db` 변수로 뽑아 재사용한다 — 같은 함수 안에서 클라이언트를 두 번 만들 이유가 없다.

- [ ] **Step 6: 토글 함수를 추가한다**

`reportComment` 아래에 넣는다:

```ts
/**
 * 좋아요 토글. like_count는 건드리지 않는다 — 트리거가 유일한 경로다
 * (FRONTEND.md §5). user_id는 DB 기본값(auth.uid())이 채운다.
 */
export async function toggleCommentLike(commentId: string, next: boolean) {
  const db = createClient();
  const { error } = next
    ? await db.from("comment_likes").insert({ comment_id: commentId })
    : await db.from("comment_likes").delete().eq("comment_id", commentId);
  if (error) throw new Error(error.message);
}
```

> `delete().eq("comment_id", ...)`에 `user_id` 조건을 붙이지 않는 이유: `comment_likes_delete_own`이 본인 행만 지우게 이미 강제한다.

- [ ] **Step 7: 낙관적 행에 초기값을 준다**

`src/lib/comment-cache.ts`의 `makeOptimisticComment`가 만드는 객체에 두 필드를 더한다:

```ts
    reply_count: 0,
    // 방금 쓴 댓글이라 좋아요는 없다.
    like_count: 0,
    liked: false,
```

- [ ] **Step 8: 통과를 확인한다 (GREEN)**

```bash
npx vitest run
```

기대: `31 passed` (기존 27 + 이번 4). 출력에 잡음이 없어야 한다.

- [ ] **Step 9: 빌드**

```bash
npm run build
```

기대: 성공. `Comment`에 필드가 늘었으므로 이를 만드는 곳이 모두 갱신됐는지 타입체커가 확인해 준다.

- [ ] **Step 10: 커밋**

```bash
git add src/lib/comments.ts src/lib/comments.test.ts src/lib/comment-cache.ts
git commit -m "feat(feed): 댓글 조회에 좋아요 수·내 좋아요 여부 병합

내가 눌렀는지는 comment_likes_select_own이 본인 행만 돌려준다는 성질로
구한다 — 프론트에서 user_id로 거르지 않는다. 답글 수와 같은 모양(페이지의
id들로 두 번째 조회 + 순수 함수로 접기)이라 읽는 사람이 한 번만 배우면 된다."
```

---

## Task 3: UI — 하트 버튼

**Files:**
- Create: `src/lib/comment-like.ts`
- Create: `src/lib/comment-like.test.ts`
- Create: `src/components/feed/comment-like-button.tsx`
- Modify: `src/components/feed/comment-item.tsx` — `CommentRow`의 액션 줄

**Interfaces:**
- Consumes: Task 2의 `Comment.like_count`, `Comment.liked`, `toggleCommentLike`; 1단계의 `isOptimistic`
- Produces:
  - `type LikeState = { liked: boolean; count: number }`
  - `nextLikeState(current: LikeState): LikeState`
  - `CommentLikeButton` — props `{ commentId: string; count: number; liked: boolean; disabled?: boolean }`

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다 (RED)**

`src/lib/comment-like.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextLikeState } from "@/lib/comment-like";

describe("nextLikeState", () => {
  it("안 누른 상태에서 누르면 켜지고 1 오른다", () => {
    expect(nextLikeState({ liked: false, count: 3 })).toEqual({
      liked: true,
      count: 4,
    });
  });

  it("누른 상태에서 다시 누르면 꺼지고 1 내린다", () => {
    expect(nextLikeState({ liked: true, count: 4 })).toEqual({
      liked: false,
      count: 3,
    });
  });

  it("두 번 누르면 제자리로 돌아온다", () => {
    const start = { liked: false, count: 7 };
    expect(nextLikeState(nextLikeState(start))).toEqual(start);
  });

  it("카운트가 0 아래로 내려가지 않는다", () => {
    // 서버 카운트가 0인데 liked가 true인 어긋난 상태에서도 -1을 그리지 않는다.
    expect(nextLikeState({ liked: true, count: 0 })).toEqual({
      liked: false,
      count: 0,
    });
  });

  it("입력을 변형하지 않는다 — 롤백이 스냅샷을 되돌린다", () => {
    const start = { liked: false, count: 1 };
    const snapshot = JSON.stringify(start);
    nextLikeState(start);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

```bash
npx vitest run src/lib/comment-like.test.ts
```

기대: `Failed to resolve import "@/lib/comment-like"` — 모듈이 아직 없다.

- [ ] **Step 3: `comment-like.ts`를 구현한다 (GREEN)**

```ts
/** 하트 하나의 표시 상태. */
export type LikeState = { liked: boolean; count: number };

/**
 * 토글 후 상태를 만든다. 순수 함수라 단위 테스트 대상이다 —
 * 두 번 눌렀을 때 제자리로 돌아오는지, 카운트가 0 아래로 새지 않는지가
 * 이 기능에서 유일하게 틀리기 쉬운 산술이다.
 *
 * 0 하한이 필요한 이유: 서버 카운트가 0인데 liked가 true인 어긋난 상태가
 * 들어올 수 있고(트리거의 greatest와 같은 방어), 그때 화면에 -1을 그리면
 * 안 된다.
 */
export function nextLikeState({ liked, count }: LikeState): LikeState {
  return liked
    ? { liked: false, count: Math.max(count - 1, 0) }
    : { liked: true, count: count + 1 };
}
```

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

```bash
npx vitest run
```

기대: `36 passed` (Task 2까지의 31 + 이번 5).

- [ ] **Step 5: `comment-like-button.tsx` 생성**

```tsx
"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { toggleCommentLike } from "@/lib/comments";
import { nextLikeState } from "@/lib/comment-like";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 댓글·답글의 좋아요 하트 (설계 결정 11).
 *
 * 누른 즉시 반영하고 실패하면 되돌린다 — 왕복을 기다리면 연타했을 때
 * 화면이 뒤늦게 따라온다 (FRONTEND.md §4).
 *
 * 상태를 색이 아니라 **채움**으로 구분한다 (DESIGN.md Colors): 유채색은
 * 도서 표지의 몫이고, 색맹 사용자에게도 형태가 더 확실하다.
 *
 * 피드의 LikeButton과 합치지 않는 이유: 그쪽은 흰색 고정 크롬이고
 * 이쪽은 시트 안 테마 토큰이다. 한 컴포넌트가 두 색 체계를 boolean prop
 * 으로 오가면 그 경계가 무너진다.
 */
export function CommentLikeButton({
  commentId,
  count,
  liked,
  disabled = false,
}: {
  commentId: string;
  count: number;
  liked: boolean;
  disabled?: boolean;
}) {
  const [state, setState] = useState({ liked, count });
  const [, startTransition] = useTransition();

  function toggle() {
    const previous = state;
    const next = nextLikeState(state);
    setState(next);

    startTransition(async () => {
      try {
        await toggleCommentLike(commentId, next.liked);
      } catch {
        setState(previous);
        toast.error("좋아요를 반영하지 못했어요");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={state.liked}
      aria-label={state.liked ? "좋아요 취소" : "좋아요"}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-1 rounded-sm px-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      <Heart
        className={cn("size-3.5", state.liked && "fill-current")}
        aria-hidden
      />
      {state.count > 0 ? (
        <span className="tabular-nums">{formatCount(state.count)}</span>
      ) : null}
    </button>
  );
}
```

> 카운트가 0이면 숫자를 감춘다 — 대부분의 댓글이 0이라 "0"이 줄줄이 늘어서면 목록이 시끄러워진다. 인스타·유튜브 모두 0을 감춘다.

> `aria-pressed`를 쓰는 이유: 토글 버튼이라 상태가 읽혀야 한다. `aria-label`은 다음 동작을 말하고, `aria-pressed`가 현재 상태를 말한다.

- [ ] **Step 6: `CommentRow`의 액션 줄에 배치한다**

`src/components/feed/comment-item.tsx`에서 `답글 달기` 버튼을 감싸 하트와 나란히 둔다. 기존 `답글 달기` 버튼의 클래스와 `disabled={pending}`은 그대로 유지하고, 두 버튼을 `flex` 줄로 묶는다:

```tsx
        <div className="flex items-center gap-1">
          <CommentLikeButton
            commentId={comment.id}
            count={comment.like_count}
            liked={comment.liked}
            disabled={pending}
          />
          <button
            type="button"
            onClick={onReply}
            disabled={pending}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center self-start rounded-sm px-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            답글 달기
          </button>
        </div>
```

import를 더한다:

```ts
import { CommentLikeButton } from "@/components/feed/comment-like-button";
```

> 하트를 우측 트레일링 열이 아니라 본문 아래 액션 줄에 두는 이유: 트레일링 열에는 이미 삭제/신고 버튼이 있고, 480px에서 44px 버튼을 둘 나란히 두면 본문이 눌린다. **유튜브도 좋아요를 본문 아래 답글과 같은 줄에 둔다** — 레이아웃과 선례가 같은 답을 가리킨다.

> `disabled={pending}`을 하트에도 거는 이유: 낙관적 행은 아직 서버 id가 없어(`optimistic-…`) 좋아요를 걸 대상이 없다. 1단계가 답글·삭제에 건 가드와 같은 이유다.

- [ ] **Step 7: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `36 passed`, 빌드 성공, 타입 오류 0건.

- [ ] **Step 8: 375px에서 실제 렌더 확인**

로컬 Supabase와 개발 서버를 띄우고 375×812에서 확인한다.

1. 댓글에 하트가 보이고, 카운트가 0이면 숫자가 없다
2. 하트를 누르면 **즉시** 채워지고 숫자가 1이 된다 (왕복을 기다리지 않는다)
3. 다시 누르면 비워지고 숫자가 사라진다 (0이라 감춰짐)
4. 새로고침해도 채움 상태가 유지된다 (서버에서 온 `liked`가 맞다)
5. 답글 행에도 하트가 있고 같게 동작한다
6. 하트와 `답글 달기`가 한 줄에 나란히 있고, 본문이 눌리지 않는다
7. 하트의 터치 타깃이 44px 이상이다 (`getBoundingClientRect().height >= 44`)
8. 색이 아니라 **채움**으로 구분된다 — 누른 하트가 빨강이 아니다
9. 방금 쓴(아직 확정 전) 댓글의 하트는 비활성이다
10. 다른 사용자로 로그인하면 그 사람의 채움 상태가 따로 보인다

- [ ] **Step 9: 커밋**

```bash
git add src/lib/comment-like.ts src/lib/comment-like.test.ts src/components/feed/comment-like-button.tsx src/components/feed/comment-item.tsx
git commit -m "feat(feed): 댓글·답글에 좋아요 하트 추가

하트를 트레일링 열이 아니라 본문 아래 액션 줄에 둔다 — 그 열에는 이미
삭제/신고가 있어 480px에서 44px 버튼을 둘 나란히 두면 본문이 눌린다.
유튜브도 좋아요를 답글과 같은 줄에 둔다.

토글 산술을 comment-like.ts 순수 함수로 뺐다: 두 번 눌러 제자리로 오는지,
카운트가 0 아래로 새지 않는지는 렌더로만 확인하기 어렵다."
```

---

## Task 4: 문서 갱신

**Files:**
- Modify: `docs/prd-ttokttok.md` — §5.5 표, §6 데이터 모델, v2 백로그, §11 결정 기록

**Interfaces:**
- Consumes: Task 1~3에서 확정된 동작

- [ ] **Step 1: §5.5 소셜 인터랙션 표에 행을 추가**

댓글·답글 행 아래에 넣는다:

```markdown
| 댓글 좋아요 | 댓글·답글 모두 토글. 카운트는 트리거가 관리하고, 상태는 색이 아니라 하트 **채움**으로 구분 | 필요 |
```

- [ ] **Step 2: §6 데이터 모델을 갱신**

`comments` 블록에 컬럼을 더한다:

```
             like_count int DEFAULT 0,          -- 비정규화 (트리거로만 증감)
```

`likes` 줄 아래에 새 표를 더한다:

```
comment_likes (user_id, comment_id) PK 복합, created_at
```

- [ ] **Step 3: v2 백로그에서 댓글 좋아요를 제거**

`docs/prd-ttokttok.md:500`의 `- 댓글 좋아요` 줄을 삭제한다. 1단계에서 대댓글은 이미 지웠으므로 **이 줄만 남아 있고**, 지우면 그 항목이 비게 되니 항목 제목까지 함께 정리한다.

- [ ] **Step 4: §11 결정 기록에 행을 추가**

표의 마지막 행은 **44번(답글 멘션)** 이다 (`docs/prd-ttokttok.md:551`). 그 다음 줄에 45번으로 붙인다:

```markdown
| 45 | 댓글 좋아요 | 게시물 좋아요의 규약을 **복제**한다 — `comment_likes` 조인 테이블 + `comments.like_count` 비정규화 + 트리거, RLS는 본인 행만 select/insert/delete. 두 좋아요가 다른 모양이면 나중에 한쪽만 고쳐진다. "내가 눌렀는지"를 프론트에서 `user_id`로 거르지 않는 이유가 여기 있다: `comment_likes_select_own`이 이미 본인 행만 돌려주므로 존재 여부가 곧 답이고, 프론트가 권한 분기로 보안을 흉내 내면 규칙이 두 곳에 생긴다. 하트는 본문 아래 액션 줄에 답글과 나란히 둔다 — 우측 트레일링 열에는 삭제/신고가 이미 있어 480px에서 44px 버튼 둘을 나란히 두면 본문이 눌린다(유튜브도 같은 배치다). 상태는 색이 아니라 채움으로 구분한다(DESIGN.md) |
```

- [ ] **Step 5: 문서와 코드가 어긋나지 않는지 확인**

```bash
grep -n "댓글 좋아요" docs/prd-ttokttok.md
```

기대: v2 백로그에는 없고 §5.5와 §11에만 나온다.

- [ ] **Step 6: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 댓글 좋아요 명세와 결정 기록 반영"
```

---

## 2단계 완료 기준

- [ ] `npx vitest run` — 36 passed, 출력에 잡음 없음
- [ ] `npm run build` 통과
- [ ] Task 1 Step 3·4의 SQL 검증 통과 (카운터 증감, 중복 좋아요 거부)
- [ ] Task 3 Step 8의 렌더 검증 10항목 통과
- [ ] PRD §5.5·§6·§11이 실제 동작과 일치

## 설계 결정 대조표

| 결정 | 내용 | 구현 위치 |
|---|---|---|
| 11 | 댓글 좋아요 추가 | Task 1 스키마 + Task 3 UI |
| 11 | 답글에도 붙임 | `comment_likes`가 `comments`를 가리킬 뿐 최상위/답글을 구분하지 않음 |
| — | 카운터는 트리거만 | Task 1 `sync_comment_like_count`, 클라이언트는 `like_count` 미접근 |
| — | 채움으로 구분 | Task 3 `fill-current`, 유채색 없음 |

## 이 단계에서 하지 않는 것

- **정렬에 좋아요를 반영하지 않는다.** 답글은 오래된 순 고정(결정 4), 최상위는 최신순이다. 유튜브의 "인기 댓글순"은 별도 결정이 필요하다.
- **좋아요 알림을 만들지 않는다.** 4단계(알림)의 몫이다 — 설계 결정 17이 알림 대상 이벤트로 "내 댓글·답글에 눌린 좋아요"를 이미 포함해 두었다.
- **누가 눌렀는지 목록을 보여주지 않는다.** `comment_likes_select_own` 때문에 애초에 남의 행을 읽을 수 없고, 그럴 요구도 없다.
