# 대댓글 (1단계) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평면 댓글에 1단 답글을 넣고, 최상위 목록을 커서 무한 스크롤로 교체한다.

**Architecture:** `comments`에 `parent_id`를 추가하고 깊이 강제·연쇄 숨김을 **DB 트리거**로 보장한다 — 클라이언트가 규칙을 몰라도 데이터가 깨지지 않고, 어드민 삭제 경로에도 자동 적용된다. UI는 시트 하나에 인라인 확장(릴스 방식): 최상위는 `useInfiniteQuery` 키셋 커서, 답글은 펼칠 때만 마운트되는 별도 `useInfiniteQuery`.

**Tech Stack:** Next.js 16 App Router / Supabase Postgres + PostgREST / TanStack Query v5 / vaul Drawer / shadcn-ui / Tailwind v4

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-09-02-comment-threads-design.md` — 결정 1~10.
- **테스트 프레임워크가 없다.** 검증은 `FRONTEND.md §7` 관례: `npm run build` 통과 + 375px 실제 렌더. 태스크마다 명시된 수동 검증을 반드시 수행한다.
- 스타일은 **시맨틱 토큰만** (`bg-background`, `text-muted-foreground`). 원시 hex·px·Tailwind 팔레트 금지 (`DESIGN.md`).
- 댓글 시트는 피드 크롬이 **아니다** — 흰색 고정 예외 구역이 아니므로 일반 토큰을 쓴다. `chrome.ts`를 import하지 않는다.
- 서버 상태는 TanStack Query, UI 상태는 `useState`. 전역 스토어 금지 (`FRONTEND.md §4`).
- 카운터(`comment_count`)를 클라이언트에서 직접 update하지 않는다 — 트리거만이 경로다 (`FRONTEND.md §5`).
- 클라이언트 컴포넌트는 `lib/supabase/client.ts`만 쓴다. 서버 것과 혼용 금지.
- 터치 타깃 44×44px 이상, 아이콘 단독 버튼에 `aria-label`, 텍스트 12px 미만 금지.
- 마이그레이션 파일명은 기존 규칙을 따른다. 마지막 파일은 `20260828000003_post_regions.sql`.
- 커밋 메시지는 한국어 + Conventional Commits (`feat(feed): …`).

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `supabase/migrations/20260902000001_comment_threads.sql` | `parent_id`·인덱스·깊이 강제 트리거·연쇄 숨김 트리거 | 생성 |
| `src/lib/comments.ts` | 순수 데이터 함수 (fetch/insert/update). React 의존 없음 | 수정 |
| `src/components/feed/comment-item.tsx` | 최상위 댓글 한 개 + 답글 목록 + 펼치기 토글 | 생성 |
| `src/components/feed/comment-sheet.tsx` | 시트 껍데기 + 무한 스크롤 목록 + 컴포저 | 수정 |
| `docs/prd-ttokttok.md` | §5.5 갱신, §11 결정 기록, v2 백로그 정리 | 수정 |

`comment-sheet.tsx`를 쪼개는 이유: 현재 238줄인데 답글·펼치기·컴포저 상태가 더해지면 배가 된다. 답글 렌더는 자기 쿼리를 갖는 독립 단위라 경계가 분명하다.

---

## Task 1: 스키마 — parent_id · 깊이 강제 · 연쇄 숨김

**Files:**
- Create: `supabase/migrations/20260902000001_comment_threads.sql`

**Interfaces:**
- Produces: `comments.parent_id uuid NULL`, 인덱스 `comments_parent_idx` / `comments_post_root_idx`, 트리거 `on_comment_flatten_depth` / `on_comment_cascade_delete`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/20260902000001_comment_threads.sql` 전체 내용:

```sql
-- ============================================================
-- 대댓글 — 1단 고정
-- 설계: docs/superpowers/specs/2026-09-02-comment-threads-design.md (결정 2·6)
--
-- 깊이를 DB가 강제하는 이유: 답글 행에도 "답글" 버튼이 있으므로(결정 8)
-- 클라이언트가 parent_id를 잘못 넣으면 3단이 생긴다. 데이터가 한번
-- 깊어지면 되돌리는 마이그레이션이 훨씬 비싸다.
--
-- 연쇄 숨김을 DB가 하는 이유: 사용자 삭제(removeComment)와 어드민 삭제
-- (deleteReportedComment)가 서로 다른 경로인데, 규칙이 한 곳에만 있으면
-- 다른 쪽에서 고아 답글이 남는다. 신고당한 부모만 지우고 답글이 남으면
-- 모더레이션이 무의미하다.
-- ============================================================

alter table public.comments
  add column parent_id uuid references public.comments (id) on delete cascade;

-- 답글 조회: 부모별 오래된 순 (결정 4)
create index comments_parent_idx
  on public.comments (parent_id, created_at)
  where parent_id is not null;

-- 최상위 키셋 커서: (created_at desc, id desc) (결정 9)
create index comments_post_root_idx
  on public.comments (post_id, created_at desc, id desc)
  where parent_id is null;

-- ------------------------------------------------------------
-- 1단 강제. 부모가 이미 답글이면 조부모로 되돌린다 —
-- 인스타·유튜브가 하는 flatten과 같은 동작이다.
-- 다른 게시물의 댓글을 부모로 지정하는 것도 여기서 막는다.
-- ------------------------------------------------------------
create function public.flatten_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_parent public.comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from public.comments where id = new.parent_id;

  if not found then
    raise exception 'PARENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_parent.post_id <> new.post_id then
    raise exception 'PARENT_POST_MISMATCH' using errcode = 'P0001';
  end if;

  -- 부모가 답글이면 그 부모(= 최상위)로 올린다.
  if v_parent.parent_id is not null then
    new.parent_id := v_parent.parent_id;
  end if;

  return new;
end;
$fn$;

create trigger on_comment_flatten_depth
  before insert on public.comments
  for each row execute function public.flatten_comment_depth();

-- ------------------------------------------------------------
-- 연쇄 숨김. 최상위 댓글이 soft delete되면 살아 있는 답글도 함께 숨긴다.
-- 답글 행마다 UPDATE가 나가므로 기존 sync_comment_count가 행마다 발동해
-- comment_count가 저절로 맞는다 — 카운터를 직접 건드리지 않는다.
--
-- 재귀 방지: parent_id가 NULL인 행(= 최상위)일 때만 연쇄한다. 답글의
-- UPDATE로 이 트리거가 다시 돌아도 즉시 빠져나간다.
--
-- 복구(deleted_at → NULL)는 연쇄하지 않는다. 되살리는 UI가 없고,
-- 연쇄 복구는 "부모와 무관하게 따로 지워진 답글"까지 되살려 버린다.
-- ------------------------------------------------------------
create function public.cascade_comment_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.parent_id is not null then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    update public.comments
       set deleted_at = new.deleted_at
     where parent_id = new.id
       and deleted_at is null;
  end if;

  return new;
end;
$fn$;

create trigger on_comment_cascade_delete
  after update of deleted_at on public.comments
  for each row execute function public.cascade_comment_delete();
```

> 함수 본문 인용부호로 `$$` 대신 `$fn$`를 쓴 이유: 기존 마이그레이션은 `$$`를 쓰지만, 본문 안에 달러 기호가 들어갈 여지를 없애고 셸 heredoc·에디터 하이라이터가 깨지지 않게 한다. Postgres 문법상 동등하다.

- [ ] **Step 2: 로컬 DB에 적용**

```bash
npx supabase db reset
```

기대: 모든 마이그레이션이 오류 없이 적용된다. `supabase` CLI가 없고 원격 프로젝트만 쓰는 환경이면 Supabase 대시보드 SQL 에디터에 위 파일 내용을 그대로 실행한다.

- [ ] **Step 3: 깊이 강제를 SQL로 검증**

SQL 에디터에서 실행한다. `<post>`·`<user>`는 실제 UUID로 치환한다 (`select id from posts limit 1;`, `select id from profiles limit 1;`).

```sql
begin;
with root as (
  insert into public.comments (post_id, user_id, content)
  values ('<post>', '<user>', 'root') returning id
), lvl2 as (
  insert into public.comments (post_id, user_id, content, parent_id)
  select '<post>', '<user>', 'lvl2', id from root returning id, parent_id
), lvl3 as (
  insert into public.comments (post_id, user_id, content, parent_id)
  select '<post>', '<user>', 'lvl3', id from lvl2 returning parent_id
)
select
  (select parent_id from lvl2) as root_id,
  (select id from lvl2)        as lvl2_id,
  (select parent_id from lvl3) as lvl3_parent;
rollback;
```

기대: `lvl3_parent` = `root_id` 이고 `lvl2_id`와는 **다르다**. 3단이 2단으로 눌렸다는 뜻이다.

- [ ] **Step 4: 연쇄 숨김과 카운터를 SQL로 검증**

```sql
begin;
-- 최상위 1개 + 답글 2개를 만든다
with root as (
  insert into public.comments (post_id, user_id, content)
  values ('<post>', '<user>', 'cascade-root') returning id
)
insert into public.comments (post_id, user_id, content, parent_id)
select '<post>', '<user>', 'reply-' || g, id from root, generate_series(1, 2) g;

select comment_count as before_count from public.posts where id = '<post>';

update public.comments set deleted_at = now()
 where content = 'cascade-root';

select content, deleted_at is not null as hidden
  from public.comments
 where content = 'cascade-root' or content like 'reply-%'
 order by content;

select comment_count as after_count from public.posts where id = '<post>';
rollback;
```

기대: 세 행 모두 `hidden = true`. `after_count` = `before_count` − 3.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260902000001_comment_threads.sql
git commit -m "feat(db): 댓글에 parent_id 추가 — 1단 강제·연쇄 숨김 트리거"
```

---

## Task 2: 데이터 계층 — 키셋 커서 + 답글 조회

**Files:**
- Modify: `src/lib/comments.ts` — `Comment` 타입(3–9행), `fetchComments`(30–41행), `addComment`(43–49행)

**Interfaces:**
- Consumes: Task 1의 `parent_id`, `comments_post_root_idx`, `comments_parent_idx`
- Produces:
  - `type Comment = { id, content, created_at, user_id, parent_id, reply_count, profiles }`
  - `type CommentCursor = { createdAt: string; id: string }`
  - `type CommentPage = { items: Comment[]; cursor: CommentCursor | null }`
  - `const COMMENT_PAGE_SIZE = 20`, `const REPLY_PAGE_SIZE = 10`
  - `fetchCommentPage(postId: string, cursor: CommentCursor | null): Promise<CommentPage>`
  - `fetchReplyPage(parentId: string, cursor: CommentCursor | null): Promise<CommentPage>`
  - `addComment(postId: string, content: string, parentId?: string | null): Promise<void>`
- 변경 없이 유지: `REPORT_REASONS`, `ReportReason`, `commentErrorMessage`, `removeComment`, `reportComment`, `timeAgo`

- [ ] **Step 1: `Comment` 타입을 교체하고 커서 타입을 추가**

`src/lib/comments.ts`의 3–9행(`export type Comment = { … };`)을 아래로 교체한다:

```ts
export type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  /** 살아 있는 답글 수. 최상위 댓글에만 의미가 있다 (답글은 항상 0). */
  reply_count: number;
  profiles: { nickname: string; avatar_url: string | null } | null;
};

/** 키셋 커서 — (created_at, id) 복합. */
export type CommentCursor = { createdAt: string; id: string };

export type CommentPage = { items: Comment[]; cursor: CommentCursor | null };

export const COMMENT_PAGE_SIZE = 20;
export const REPLY_PAGE_SIZE = 10;

const COMMENT_SELECT =
  "id, content, created_at, user_id, parent_id, profiles ( nickname, avatar_url )";

/** 페이지가 꽉 찼을 때만 다음 커서를 만든다 — 덜 찼으면 마지막 페이지다. */
function toCursor(items: Comment[], size: number): CommentCursor | null {
  if (items.length < size) return null;
  const last = items[items.length - 1];
  return { createdAt: last.created_at, id: last.id };
}
```

- [ ] **Step 2: `fetchComments`를 `fetchCommentPage` + `withReplyCounts`로 교체**

30–41행의 `fetchComments` 함수 전체를 아래로 교체한다:

```ts
/**
 * 최상위 댓글 한 페이지. 최신순 + (created_at, id) 키셋 커서.
 *
 * 커서를 숫자가 아니라 타임스탬프로 주고받는다 — §11-37에서 double을
 * 커서로 쓰다 페이지가 겹쳤던 원인은 float의 왕복 손실이었고,
 * timestamptz의 텍스트 왕복은 마이크로초까지 정확해 같은 함정이 없다.
 * 동점 시각은 id로 가른다.
 */
export async function fetchCommentPage(
  postId: string,
  cursor: CommentCursor | null,
): Promise<CommentPage> {
  const db = createClient();

  let q = db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(COMMENT_PAGE_SIZE);

  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Omit<Comment, "reply_count">[];
  const items = await withReplyCounts(db, rows);
  return { items, cursor: toCursor(items, COMMENT_PAGE_SIZE) };
}

/**
 * 최상위 댓글들의 살아 있는 답글 수를 한 번에 센다.
 *
 * PostgREST의 중첩 count(`replies:comments!parent_id(count)`)를 쓰지 않는
 * 이유: 중첩 집계에는 deleted_at 필터를 함께 걸 수 없어 삭제된 답글까지
 * 세고, 연쇄 숨김(결정 6) 직후 "답글 3개 보기"를 눌렀는데 아무것도
 * 안 나오는 상태가 된다.
 */
async function withReplyCounts(
  db: ReturnType<typeof createClient>,
  rows: Omit<Comment, "reply_count">[],
): Promise<Comment[]> {
  if (!rows.length) return [];

  const { data, error } = await db
    .from("comments")
    .select("parent_id")
    .in(
      "parent_id",
      rows.map((r) => r.id),
    )
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const { parent_id } of (data ?? []) as { parent_id: string }[]) {
    counts.set(parent_id, (counts.get(parent_id) ?? 0) + 1);
  }

  return rows.map((r) => ({ ...r, reply_count: counts.get(r.id) ?? 0 }));
}
```

- [ ] **Step 3: 답글 페이지 조회를 추가**

`withReplyCounts` 바로 아래에 넣는다:

```ts
/** 한 댓글의 답글 한 페이지. 오래된 순 고정 (결정 4). */
export async function fetchReplyPage(
  parentId: string,
  cursor: CommentCursor | null,
): Promise<CommentPage> {
  let q = createClient()
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(REPLY_PAGE_SIZE);

  if (cursor) {
    q = q.or(
      `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // 답글은 자식을 가질 수 없다(1단 고정) — 집계 없이 0으로 채운다.
  const items = ((data ?? []) as unknown as Omit<Comment, "reply_count">[]).map(
    (r) => ({ ...r, reply_count: 0 }),
  );
  return { items, cursor: toCursor(items, REPLY_PAGE_SIZE) };
}
```

- [ ] **Step 4: `addComment`가 부모를 받도록 확장**

기존 `addComment`(43–49행)를 교체한다:

```ts
export async function addComment(
  postId: string,
  content: string,
  parentId: string | null = null,
) {
  // user_id는 DB 기본값(auth.uid())이 채운다.
  // 깊이는 flatten_comment_depth 트리거가 보장하므로 여기서 검사하지 않는다.
  const { error } = await createClient()
    .from("comments")
    .insert({ post_id: postId, content, parent_id: parentId });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: 타입체크로 남은 참조를 확인**

```bash
npm run build
```

기대: `src/components/feed/comment-sheet.tsx`에서 `fetchComments`를 찾을 수 없다는 오류 **하나만** 난다. Task 3에서 고치므로 이 시점의 실패는 정상이다. 다른 파일에서 오류가 나면 그 파일도 `fetchComments`를 쓰고 있다는 뜻이니 Task 3 범위에 추가한다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/comments.ts
git commit -m "feat(feed): 댓글 데이터 계층을 키셋 커서로 교체 + 답글 조회 추가"
```

---

## Task 3: 답글 UI — 인라인 확장

**Files:**
- Create: `src/components/feed/comment-item.tsx`
- Modify: `src/components/feed/comment-sheet.tsx` (전면 개편)

**Interfaces:**
- Consumes: Task 2의 `fetchCommentPage`, `fetchReplyPage`, `addComment`, `Comment`, `CommentCursor`, `CommentPage`
- Produces (모두 `comment-item.tsx`에서 export):
  - `type ReplyTarget = { parentId: string; nickname: string }`
  - `type RowActions = { currentUserId: string; reporting: string | null; removePending: boolean; reportPending: boolean; onRemove(id: string): void; onOpenReport(id: string): void; onSubmitReport(id: string, reason: ReportReason): void; onCancelReport(): void }`
  - `CommentItem` — props `{ comment: Comment; actions: RowActions; onReply(target: ReplyTarget): void }`
- `CommentSheet` props는 변경 없다: `{ postId, currentUserId, children }`

> `onOpenReport`(사유 UI 열기)와 `onSubmitReport`(사유를 골라 실제 신고)를 **나눠 둔다.** 기존 코드는 깃발 버튼과 사유 버튼이 같은 `setReporting`을 호출해도 문제가 없었지만, 액션을 props로 내려보내는 순간 두 의미가 한 이름에 겹치면 사유가 전달되지 않는 버그가 된다.

- [ ] **Step 1: `comment-item.tsx` 생성**

한 최상위 댓글과 그 답글 서브트리를 그린다. 답글 쿼리는 **펼쳤을 때만** 활성화된다.

```tsx
"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Flag, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  REPORT_REASONS,
  fetchReplyPage,
  timeAgo,
  type Comment,
  type CommentCursor,
  type CommentPage,
  type ReportReason,
} from "@/lib/comments";

/** 컴포저가 "누구에게 다는 답글인지" 알기 위한 최소 정보. */
export type ReplyTarget = { parentId: string; nickname: string };

/**
 * 행 하나가 필요로 하는 동작 묶음. 최상위와 답글이 같은 행 컴포넌트를
 * 쓰므로 한 벌로 내려보낸다.
 *
 * 신고가 두 함수인 이유: 깃발 버튼은 사유 선택 UI를 열 뿐이고, 실제
 * 신고는 사유를 골라야 일어난다. 한 이름으로 합치면 사유가 전달되지 않는다.
 */
export type RowActions = {
  currentUserId: string;
  reporting: string | null;
  removePending: boolean;
  reportPending: boolean;
  onRemove: (id: string) => void;
  onOpenReport: (id: string) => void;
  onSubmitReport: (id: string, reason: ReportReason) => void;
  onCancelReport: () => void;
};

/**
 * 댓글 한 줄. 최상위와 답글이 같은 마크업을 쓴다 — 답글은 아바타가 한
 * 단계 작고(size-6) 부모가 들여쓰기를 준다. 마크업을 두 벌로 나누면
 * 신고·삭제 동작이 한쪽에서만 고쳐진다.
 */
function CommentRow({
  comment,
  actions,
  compact = false,
  onReply,
}: {
  comment: Comment;
  actions: RowActions;
  compact?: boolean;
  onReply: () => void;
}) {
  const mine = comment.user_id === actions.currentUserId;
  const nickname = comment.profiles?.nickname ?? "독자";

  return (
    <li className="flex gap-3">
      <Avatar className={compact ? "size-6 shrink-0" : "size-8 shrink-0"}>
        {comment.profiles?.avatar_url ? (
          <AvatarImage src={comment.profiles.avatar_url} alt="" />
        ) : null}
        <AvatarFallback className="text-xs">
          {nickname.slice(0, 1)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{nickname}</span>
          <span className="text-muted-foreground text-xs">
            {timeAgo(comment.created_at)}
          </span>
        </div>

        <p className="text-sm leading-relaxed break-keep whitespace-pre-wrap">
          {comment.content}
        </p>

        <button
          type="button"
          onClick={onReply}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring self-start rounded-sm text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          답글 달기
        </button>

        {actions.reporting === comment.id ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {REPORT_REASONS.map((r) => (
              <Button
                key={r.value}
                variant="secondary"
                size="sm"
                disabled={actions.reportPending}
                onClick={() => actions.onSubmitReport(comment.id, r.value)}
              >
                {r.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.onCancelReport}
            >
              취소
            </Button>
          </div>
        ) : null}
      </div>

      {mine ? (
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground min-h-11 min-w-11 shrink-0"
          aria-label="댓글 삭제"
          disabled={actions.removePending}
          onClick={() => actions.onRemove(comment.id)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground min-h-11 min-w-11 shrink-0"
          aria-label="댓글 신고"
          onClick={() => actions.onOpenReport(comment.id)}
        >
          <Flag className="size-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}

/**
 * 최상위 댓글 + 답글 서브트리 (설계 결정 1·3).
 *
 * 답글 쿼리는 `enabled: expanded` — 접혀 있는 동안에는 네트워크를 쓰지
 * 않는다. 시트를 닫으면 이 컴포넌트가 언마운트되므로 펼침 상태도 함께
 * 초기화된다 (두 레퍼런스와 동일).
 */
export function CommentItem({
  comment,
  actions,
  onReply,
}: {
  comment: Comment;
  actions: RowActions;
  onReply: (target: ReplyTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nickname = comment.profiles?.nickname ?? "독자";

  const replies = useInfiniteQuery({
    queryKey: ["replies", comment.id],
    queryFn: ({ pageParam }) =>
      fetchReplyPage(comment.id, pageParam as CommentCursor | null),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (last: CommentPage) => last.cursor,
    enabled: expanded,
  });

  const loaded = replies.data?.pages.flatMap((p) => p.items) ?? [];
  // 펼친 뒤에는 실제로 받은 개수를 신뢰한다 — 낙관적 추가가 반영된다.
  const count = expanded ? loaded.length : comment.reply_count;

  return (
    <li className="flex flex-col gap-3">
      <ul className="contents">
        <CommentRow
          comment={comment}
          actions={actions}
          onReply={() => onReply({ parentId: comment.id, nickname })}
        />
      </ul>

      {count > 0 || expanded ? (
        <div className="flex flex-col gap-3 pl-11">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 items-center gap-1 self-start rounded-sm text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            {expanded ? (
              <ChevronUp className="size-3.5" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden />
            )}
            {expanded ? "답글 숨기기" : `답글 ${count}개 보기`}
          </button>

          {expanded ? (
            replies.isLoading ? (
              <div className="flex gap-3">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {loaded.map((r) => (
                    <CommentRow
                      key={r.id}
                      comment={r}
                      actions={actions}
                      compact
                      onReply={() =>
                        onReply({
                          // 1단 고정 — 답글의 답글도 부모는 최상위다.
                          parentId: comment.id,
                          nickname: r.profiles?.nickname ?? "독자",
                        })
                      }
                    />
                  ))}
                </ul>

                {replies.hasNextPage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    disabled={replies.isFetchingNextPage}
                    onClick={() => void replies.fetchNextPage()}
                  >
                    답글 더 보기
                  </Button>
                ) : null}
              </>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 2: `comment-sheet.tsx` 전면 교체**

파일 전체를 아래로 바꾼다.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CommentItem,
  type ReplyTarget,
  type RowActions,
} from "@/components/feed/comment-item";
import { track } from "@/lib/analytics";
import {
  addComment,
  commentErrorMessage,
  fetchCommentPage,
  removeComment,
  reportComment,
  type CommentCursor,
  type CommentPage,
  type ReportReason,
} from "@/lib/comments";

/**
 * 댓글 바텀시트 (PRD §5.5).
 *
 * 목록은 시트를 열 때 받는다 — 피드의 모든 게시물 댓글을 미리 받을
 * 이유가 없다. 서버 상태라 TanStack Query가 맡는다 (FRONTEND.md §4).
 *
 * 답글은 인라인 확장이다 — 시트 안에 네비게이션 스택을 만들지 않는다
 * (설계 결정 1). 그래서 이 컴포넌트에는 화면 전환 상태가 없고,
 * 펼침 여부는 각 CommentItem이 스스로 들고 있다.
 */
export function CommentSheet({
  postId,
  currentUserId,
  children,
}: {
  postId: string;
  currentUserId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const key = ["comments", postId];

  const list = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      fetchCommentPage(postId, pageParam as CommentCursor | null),
    initialPageParam: null as CommentCursor | null,
    getNextPageParam: (last: CommentPage) => last.cursor,
    enabled: open, // 열기 전에는 받지 않는다
  });

  const comments = list.data?.pages.flatMap((p) => p.items) ?? [];

  // 답글 대상이 정해지면 입력창으로 포커스를 옮긴다 —
  // 멘션이 없으므로(결정 7) 배너가 유일한 대상 표시다.
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const add = useMutation({
    mutationFn: ({
      content,
      parentId,
    }: {
      content: string;
      parentId: string | null;
    }) => addComment(postId, content, parentId),
    onSuccess: (_data, { parentId }) => {
      setDraft("");
      setReplyTo(null);
      void track("comment", { postId });
      // 답글이면 그 부모의 답글 목록만, 최상위면 목록 전체를 새로 받는다.
      void qc.invalidateQueries({
        queryKey: parentId ? ["replies", parentId] : key,
      });
      if (parentId) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(commentErrorMessage(e.message)),
  });

  const remove = useMutation({
    mutationFn: removeComment,
    onSuccess: () => {
      // 연쇄 숨김(결정 6)으로 답글도 사라지므로 답글 캐시까지 무효화한다.
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["replies"] });
    },
    onError: () => toast.error("삭제하지 못했어요"),
  });

  const report = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: ReportReason }) =>
      reportComment(id, reason),
    onSuccess: () => {
      setReporting(null);
      toast.success("신고를 접수했어요");
    },
    onError: (e: Error) => {
      setReporting(null);
      toast(
        e.message === "ALREADY_REPORTED"
          ? "이미 신고한 댓글이에요"
          : "신고하지 못했어요",
      );
    },
  });

  const actions: RowActions = {
    currentUserId,
    reporting,
    removePending: remove.isPending,
    reportPending: report.isPending,
    onRemove: (id) => remove.mutate(id),
    onOpenReport: (id) => setReporting(id),
    onSubmitReport: (id, reason) => report.mutate({ id, reason }),
    onCancelReport: () => setReporting(null),
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>댓글</DrawerTitle>
        </DrawerHeader>

        <ScrollArea className="max-h-[45vh] px-4">
          {list.isLoading ? (
            <div className="flex flex-col gap-4 pb-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !comments.length ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              첫 댓글을 남겨보세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-4 pb-4">
              {comments.map((c) => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  actions={actions}
                  onReply={setReplyTo}
                />
              ))}

              {list.hasNextPage ? (
                <li>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? "불러오는 중…" : "댓글 더 보기"}
                  </Button>
                </li>
              ) : null}
            </ul>
          )}
        </ScrollArea>

        {replyTo ? (
          <div className="text-muted-foreground flex items-center gap-2 border-t px-4 pt-3 text-xs">
            <span className="truncate">
              {replyTo.nickname}님에게 답글 남기는 중
            </span>
            <Button
              variant="ghost"
              size="icon-lg"
              className="ml-auto min-h-11 min-w-11 shrink-0"
              aria-label="답글 대상 해제"
              onClick={() => setReplyTo(null)}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}

        <form
          className={
            replyTo
              ? "flex items-end gap-2 px-4 pt-1 pb-4"
              : "flex items-end gap-2 border-t p-4"
          }
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (text) {
              add.mutate({ content: text, parentId: replyTo?.parentId ?? null });
            }
          }}
        >
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={replyTo ? "답글을 남겨보세요" : "댓글을 남겨보세요"}
            aria-label={replyTo ? "답글 입력" : "댓글 입력"}
            rows={1}
            maxLength={1000}
            className="max-h-32 min-h-11 flex-1 resize-none"
          />
          <Button
            type="submit"
            size="icon-lg"
            className="min-h-11 min-w-11 shrink-0"
            aria-label={replyTo ? "답글 등록" : "댓글 등록"}
            disabled={!draft.trim() || add.isPending}
          >
            {add.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
```

> 헤더에서 `댓글 {n}` 숫자를 뺀 이유: 무한 스크롤이라 `comments.length`가 "받은 만큼"일 뿐 전체 수가 아니다. 잘못된 숫자를 보여주느니 빼는 편이 낫고, 전체 수는 레일 배지(`post.comment_count`)가 이미 말한다.

- [ ] **Step 3: 빌드**

```bash
npm run build
```

기대: 성공. 타입 오류 0건.

- [ ] **Step 4: 375px에서 실제 렌더 확인**

```bash
npm run dev
```

브라우저를 375×812로 맞추고 홈 피드에서 다음을 순서대로 확인한다.

1. 댓글 버튼 → 시트가 열리고 목록이 뜬다
2. 댓글을 하나 쓴다 → 목록 맨 위에 나타난다
3. 그 댓글의 `답글 달기` → 입력창 위에 `○○님에게 답글 남기는 중` 배너가 뜨고 포커스가 입력창으로 간다
4. 답글을 쓴다 → 배너가 사라지고, 부모 아래 `답글 1개 보기`가 생긴다
5. `답글 1개 보기` → 그 자리에서 펼쳐진다. **화면 전환이 없어야 한다**
6. 펼친 답글의 `답글 달기` → 배너에 그 답글 작성자 이름이 뜨고, 등록하면 **같은 부모 아래 형제로** 붙는다 (들여쓰기가 더 깊어지지 않는다)
7. `답글 숨기기` → 접힌다
8. 부모 댓글을 삭제한다 → 부모와 답글이 **모두** 사라진다
9. 시트를 닫았다 다시 연다 → 펼침 상태가 초기화돼 있다
10. 댓글이 20개를 넘으면 `댓글 더 보기`가 뜨고, 눌렀을 때 **중복이나 누락이 없다**

- [ ] **Step 5: 커밋**

```bash
git add src/components/feed/comment-item.tsx src/components/feed/comment-sheet.tsx
git commit -m "feat(feed): 대댓글 인라인 확장 UI + 최상위 무한 스크롤"
```

---

## Task 4: 낙관적 작성 + 레일 배지 델타

설계 결정 10. Task 3까지는 등록 후 서버 왕복을 기다린다 — 인스타·유튜브가
모두 즉시 반영하는 지점이라 "똑같은 UX"에서 가장 크게 체감되는 차이다.

**Files:**
- Modify: `src/components/feed/comment-sheet.tsx` — `add` mutation, `CommentSheet` props
- Modify: `src/components/feed/action-bar.tsx` — 댓글 카운트 로컬 델타

**Interfaces:**
- Consumes: Task 3의 `CommentSheet`, Task 2의 `Comment` / `CommentPage`
- Produces: `CommentSheet` props에 `onAdded?: () => void` 추가

- [ ] **Step 1: `add` mutation을 낙관적으로 바꾼다**

`comment-sheet.tsx`의 `add` mutation 전체를 교체한다. 삭제·신고는 손대지 않는다 — 연쇄 숨김(결정 6)을 낙관적으로 재현하려면 클라이언트가 서버 로직을 복사해야 한다.

```ts
  const add = useMutation({
    mutationFn: ({
      content,
      parentId,
    }: {
      content: string;
      parentId: string | null;
    }) => addComment(postId, content, parentId),

    onMutate: async ({ content, parentId }) => {
      const target = parentId ? ["replies", parentId] : key;
      await qc.cancelQueries({ queryKey: target });
      const previous = qc.getQueryData<InfiniteData<CommentPage>>(target);

      // 서버가 만들 행을 흉내 낸다. id는 임시값이고 성공 시 무효화로 교체된다.
      const optimistic: Comment = {
        id: `optimistic-${Date.now()}`,
        content,
        created_at: new Date().toISOString(),
        user_id: currentUserId,
        parent_id: parentId,
        reply_count: 0,
        profiles: null,
      };

      qc.setQueryData<InfiniteData<CommentPage>>(target, (old) => {
        if (!old?.pages.length) return old;
        const pages = [...old.pages];
        if (parentId) {
          // 답글은 오래된 순이므로 마지막 페이지 끝에 붙는다.
          const i = pages.length - 1;
          pages[i] = { ...pages[i], items: [...pages[i].items, optimistic] };
        } else {
          // 최상위는 최신순이므로 첫 페이지 앞에 붙는다.
          pages[0] = { ...pages[0], items: [optimistic, ...pages[0].items] };
        }
        return { ...old, pages };
      });

      setDraft("");
      setReplyTo(null);
      return { target, previous };
    },

    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.target, ctx.previous);
      toast.error(commentErrorMessage(e.message));
    },

    onSuccess: () => {
      void track("comment", { postId });
      onAdded?.();
    },

    // 성공이든 실패든 서버 상태로 정렬을 맞춘다.
    onSettled: (_data, _e, { parentId }) => {
      void qc.invalidateQueries({
        queryKey: parentId ? ["replies", parentId] : key,
      });
      if (parentId) void qc.invalidateQueries({ queryKey: key });
    },
  });
```

`onMutate`에서 `setDraft("")` / `setReplyTo(null)`을 하므로, 기존 `onSuccess`에 있던 두 줄은 위 코드에 이미 반영돼 있다.

- [ ] **Step 2: 필요한 import와 prop을 추가**

`comment-sheet.tsx` 상단 import에 `InfiniteData`와 `Comment` 타입을 더한다:

```ts
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
```

```ts
import {
  addComment,
  commentErrorMessage,
  fetchCommentPage,
  removeComment,
  reportComment,
  type Comment,
  type CommentCursor,
  type CommentPage,
  type ReportReason,
} from "@/lib/comments";
```

props에 `onAdded`를 더한다:

```tsx
export function CommentSheet({
  postId,
  currentUserId,
  onAdded,
  children,
}: {
  postId: string;
  currentUserId: string;
  /** 등록이 성공했을 때. 레일 배지의 로컬 델타에 쓴다. */
  onAdded?: () => void;
  children: React.ReactNode;
}) {
```

- [ ] **Step 3: 레일 배지에 로컬 델타를 붙인다**

`action-bar.tsx`는 이미 `shareCount`를 같은 방식으로 들고 있다 — 그 패턴을 그대로 따른다. 카운터 자체는 트리거가 증감하고(`FRONTEND.md §5`), 여기서 바꾸는 것은 **표시값**뿐이다.

`ActionBar` 본문에 상태를 추가한다:

```ts
  const [commentCount, setCommentCount] = useState(post.comment_count);
```

`commentButton`의 카운트를 그 상태로 바꾼다:

```tsx
  const commentButton = (
    <button type="button" aria-label="댓글" className={CHROME_ACTION}>
      <MessageCircle className={CHROME_ICON} aria-hidden />
      <span className={CHROME_COUNT}>{formatCount(commentCount)}</span>
    </button>
  );
```

`CommentSheet` 호출에 콜백을 넘긴다. 답글도 `comment_count`에 포함되므로(결정 5) 최상위·답글을 구분하지 않고 1씩 올린다:

```tsx
        <CommentSheet
          postId={post.id}
          currentUserId={userId!}
          onAdded={() => setCommentCount((n) => n + 1)}
        >
          {commentButton}
        </CommentSheet>
```

- [ ] **Step 4: 빌드**

```bash
npm run build
```

기대: 성공. 타입 오류 0건.

- [ ] **Step 5: 375px에서 낙관적 동작 확인**

```bash
npm run dev
```

1. 댓글을 쓴다 → **입력창이 즉시 비고 목록에 즉시 나타난다** (스피너를 기다리지 않는다)
2. 그 직후 레일의 댓글 숫자가 1 올라간다
3. 답글을 쓴다 → 펼쳐진 답글 목록 **끝에** 즉시 붙는다. 목록이 접히거나 깜빡이지 않는다
4. 레일 숫자가 답글에도 1 올라간다
5. 네트워크를 끊고 댓글을 쓴다 → 잠깐 나타났다 **사라지고** 오류 토스트가 뜬다 (롤백)
6. 금칙어를 넣어 쓴다 → 사라지고 "사용할 수 없는 표현이 포함되어 있어요." 토스트가 뜬다

- [ ] **Step 6: 커밋**

```bash
git add src/components/feed/comment-sheet.tsx src/components/feed/action-bar.tsx
git commit -m "feat(feed): 댓글·답글 작성을 낙관적으로 + 레일 배지 로컬 델타"
```

---

## Task 5: 문서 갱신

**Files:**
- Modify: `docs/prd-ttokttok.md` — §5.5 표(`:175` 부근), v2 백로그(`:498`), §11 결정 기록(표 끝)

**Interfaces:**
- Consumes: Task 1~3에서 확정된 동작

- [ ] **Step 1: §5.5 소셜 인터랙션 표를 갱신**

`docs/prd-ttokttok.md`의 §5.5 표에서 댓글 행을 아래로 바꾼다:

```markdown
| 댓글 | 작성/삭제(본인), 최신순 목록, 무한 스크롤, 바텀시트 UI | 필요 |
| 답글 | 댓글당 1단 고정. 인라인 확장(접힘 기본, "답글 N개 보기"), 오래된 순 | 필요 |
```

같은 절의 **댓글 모더레이션** 목록 마지막 항목을 아래로 바꾼다:

```markdown
- 삭제된 댓글은 soft delete ("삭제된 댓글입니다" 표시 없이 목록에서 제외).
  **최상위 댓글을 지우면 그 답글도 함께 숨긴다** — 고아 답글이 남으면 모더레이션이
  무의미하고, 자리표시자를 두면 위 규칙과 충돌한다 (§11-43).
```

- [ ] **Step 2: §6 데이터 모델의 `comments` 정의를 갱신**

```
comments     id PK, post_id FK, user_id FK, content text,
             parent_id uuid NULL FK comments(id),   -- NULL = 최상위, 그 외 = 답글(1단 고정)
             deleted_at timestamptz NULL, created_at
```

- [ ] **Step 3: v2 백로그에서 대댓글을 제거**

`:498` 부근의 "v2 백로그 (명시적 보류)" 항목에서 `대댓글, 댓글 좋아요`를 `댓글 좋아요`로 바꾼다 (좋아요는 2단계에서 다룬다).

- [ ] **Step 4: §11 결정 기록에 행을 추가**

표 마지막(현재 42번) 다음에 붙인다:

```markdown
| 43 | 대댓글 | **1단 고정 + 인라인 확장**(2026-09-02). "인스타 릴스·유튜브와 똑같이"는 성립하지 않는다 — 릴스는 인라인 확장, 유튜브는 시트 안 푸시 패널이다. 릴스를 택한 이유는 시트 내부 네비게이션 스택이 뒤로가기·포커스·스크롤 복원이라는 새 버그 표면을 만드는 데 비해 480px 책 발견 피드에서 얻는 게 "긴 스레드 격리"뿐이기 때문이다. 깊이와 연쇄 숨김은 **DB 트리거가 강제한다** — 답글에도 답글 버튼이 있어 클라이언트가 3단을 만들 수 있고, 삭제 경로가 사용자·어드민 둘이라 규칙이 한 곳에만 있으면 고아 답글이 남는다. 부모 삭제 시 답글도 숨기는 쪽(인스타)을 택해 기존 "표시 없이 제외" 규칙을 지켰다 |
| 44 | 답글 멘션 | **@멘션을 두지 않는다**. 두 레퍼런스는 답글에도 답글 버튼이 있어 형제로 flatten되는 구조를 @멘션으로 보완하는데, 우리는 멘션 없이 답글 버튼만 둔다. **알려진 한계**: 한 스레드에 3명 이상이 얽히면 누가 누구에게 한 말인지 UI가 말해주지 않는다. 되돌리는 비용은 작다(`mentioned_user_id` 가산 마이그레이션) |
```

- [ ] **Step 5: 문서와 코드가 어긋나지 않는지 확인**

```bash
grep -n "대댓글" docs/prd-ttokttok.md
```

기대: v2 백로그에는 더 이상 나오지 않고, §5.5와 §11에만 나온다.

- [ ] **Step 6: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 대댓글 명세와 결정 기록 반영"
```

---

## 1단계 완료 기준

- [ ] `npm run build` 통과
- [ ] Task 1 Step 3·4의 SQL 검증 통과 (깊이 flatten, 연쇄 숨김 + 카운터)
- [ ] Task 3 Step 4의 렌더 검증 10항목 전부 통과
- [ ] Task 4 Step 5의 낙관적 동작 검증 6항목 전부 통과
- [ ] PRD §5.5·§6·§11이 실제 동작과 일치

## 설계 결정 대조표

계획이 설계 문서의 결정을 빠짐없이 덮는지 확인하는 표다.

| 결정 | 내용 | 구현 위치 |
|---|---|---|
| 1 | 인라인 확장 | Task 3 — `CommentItem`의 `expanded` 상태 |
| 2 | 1단 고정 | Task 1 — `flatten_comment_depth` 트리거 |
| 3 | 펼칠 때 10개씩 | Task 2 — `REPLY_PAGE_SIZE`, `fetchReplyPage` |
| 4 | 답글 오래된 순 | Task 2 — `fetchReplyPage`의 `ascending: true` |
| 5 | 배지에 답글 포함 | Task 1 Step 4 검증 + Task 4 Step 3 (구분 없이 +1) |
| 6 | 연쇄 숨김 | Task 1 — `cascade_comment_delete` 트리거 |
| 7 | @멘션 없음 | Task 3 — 배너만 두고 본문 프리필 없음 |
| 8 | 답글에도 답글 버튼 | Task 3 — `CommentRow`의 `답글 달기` |
| 9 | 무한 스크롤 | Task 2 커서 + Task 3 `useInfiniteQuery` |
| 10 | 작성만 낙관적 + 레일 델타 | Task 4 |

## 다음 단계

2단계(댓글 좋아요) 계획은 이 단계가 끝난 뒤 작성한다. 1단계에서 확정되는
캐시 키 구조(`["comments", postId]` / `["replies", commentId]`)와 낙관적
갱신 방식 위에 2~5단계가 전부 얹히기 때문이다.
