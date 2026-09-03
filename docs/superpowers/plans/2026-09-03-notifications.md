# 알림 (4단계) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 댓글에 달린 답글과 좋아요를 알림으로 받고, 탭하면 그 댓글로 정확히 간다.

**Architecture:** 알림 행은 **트리거가 만든다** — 답글 INSERT와 좋아요 INSERT 두 경로가 있어 클라이언트가 만들면 한쪽에서 빠진다. 목록은 서버 컴포넌트가 가져오고 배지만 60초 폴링하는 클라이언트 조각이다. 딥링크는 목록을 뒤져 스크롤하지 않고 **대상 댓글을 시트 최상단에 고정(핀)** 한다 — 페이지네이션 깊이와 무관하게 항상 성립한다.

**Tech Stack:** Next.js 16.3.3 App Router / React 19 / Supabase Postgres + PostgREST / TanStack Query v5 / Vitest / Tailwind v4 / shadcn-ui / vaul

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-09-02-comment-threads-design.md` — **결정 12~17**.
- **알림 대상 이벤트는 2종뿐이다** (결정 17): 내 댓글·답글에 달린 답글, 내 댓글·답글에 눌린 좋아요. 이 앱은 UGC가 아니라 게시물을 어드민이 만들므로 "내 게시물에 댓글/좋아요"는 받을 사람이 없다.
- **본인이 본인에게 한 행위는 알림을 만들지 않는다.**
- **읽음은 개별 탭해야 처리된다** (결정 15). 목록 진입으로 일괄 처리하지 않는다.
- **좋아요만 묶는다** (결정 16). 답글은 건별 — 묶으면 딥링크 목적지가 여럿이 되어 결정 13이 성립하지 않고, 내용도 목적지도 제각각이라 정보가 사라진다.
- **배지는 60초 폴링 + 창 포커스** (결정 14). Realtime을 쓰지 않는다 — 하루 몇 건 볼륨에 WebSocket 상주가 과하고 이 저장소에 선례가 없다.
- 파생 데이터는 **트리거가 유일한 생성 경로다** (`docs/FRONTEND.md` §5).
- 보안은 RLS가 담당한다. 단 정책이 본인 행으로 좁혀주지 않는 표에서는 조건을 명시한다 (§11-46).
- 스타일은 **시맨틱 토큰만**. **예외**: 피드 위에 얹히는 크롬은 흰색 고정 구역이다 (`docs/DESIGN.md` Colors) — 상단 바가 여기 속한다.
- `docs/DESIGN.md:155` verbatim: `터치 타깃 최소 44×44px, 인접 타깃 간 8px 이상.` **두 절 모두.**
- 토글·상태 버튼의 **접근 가능한 이름은 상태에 따라 바뀌지 않는다** — 2단계에서 스크린리더가 "좋아요 취소, 눌림"으로 읽는 사고가 있었다.
- 테스트는 순수 함수만. Supabase 쿼리 빌더를 모킹하지 않는다 (`docs/FRONTEND.md` §7).
- 마이그레이션 파일명 규칙: `YYYYMMDDNNNNNN_<name>.sql`. 직전 파일은 `20260903000001_comment_likes.sql`.
- 한국어 주석으로 **왜**를 적는다. 커밋 메시지는 한국어 + Conventional Commits.

---

## File Structure

| 파일 | 책임 | 변경 | 태스크 |
|---|---|---|---|
| `supabase/migrations/20260903000002_notifications.sql` | 테이블·트리거 2종·RLS·인덱스 | 생성 | 1 |
| `src/lib/notifications.ts` | 서버 조회 + 순수 묶음 함수 | 생성 | 2 |
| `src/lib/notifications-client.ts` | 읽음 처리 (브라우저 클라이언트) | 생성 | 2 |
| `src/lib/notifications.test.ts` | 묶음 단위 테스트 | 생성 | 2 |
| `src/app/(main)/notifications/page.tsx` | 알림 목록 화면 (서버 컴포넌트) | 생성 | 3 |
| `src/components/notifications/notification-row.tsx` | 알림 한 줄 + 읽음 처리 (클라이언트) | 생성 | 3 |
| `src/lib/comments.ts` | 딥링크 대상 댓글 문맥 조회 | 수정 | 4 |
| `src/components/feed/comment-sheet.tsx` | 대상 댓글 핀 렌더 | 수정 | 4 |
| `src/components/feed/comment-item.tsx` | 강조 표시 | 수정 | 4 |
| `src/components/feed/action-bar.tsx` | 딥링크 파라미터 통과 | 수정 | 4 |
| `src/components/feed/post-item.tsx` | 딥링크 통과, 상단 스크림 | 수정 | 4·5 |
| `src/components/feed/top-bar.tsx` | 로고 + 알림 종 (오버레이) | 생성 | 5 |
| `src/components/feed/unread-badge.tsx` | 60초 폴링 배지 (클라이언트) | 생성 | 5 |
| `src/components/feed/chrome.ts` | 세이프존 상단 값 재계산 | 수정 | 5 |
| `docs/prd-ttokttok.md`, `docs/DESIGN.md` | 명세·결정 기록·스크림 서술 | 수정 | 6 |

**태스크 4를 5보다 먼저 하는 이유**: 딥링크가 있어야 알림이 쓸모를 갖는다. 상단 바는 진입점일 뿐이라 마지막에 붙여도 앞 태스크들이 각자 검증된다(알림 화면은 `/notifications` 직접 접근으로 확인 가능).

---

## Task 1: 스키마 — notifications 테이블과 트리거 2종

**Files:**
- Create: `supabase/migrations/20260903000002_notifications.sql`

**Interfaces:**
- Produces: `public.notifications`, 트리거 `on_reply_notify` / `on_comment_like_notify`, RLS 정책 2개, 인덱스 `notifications_recipient_idx`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- ============================================================
-- 알림 (설계 결정 12~17)
--
-- 행을 트리거가 만드는 이유: 답글은 comments INSERT, 좋아요는
-- comment_likes INSERT로 서로 다른 경로다. 클라이언트가 만들면 한쪽
-- 경로에서 빠지고, 그때 알림이 "가끔 안 오는" 상태가 된다.
--
-- 대상 이벤트가 2종뿐인 이유: 이 앱은 UGC가 아니라 게시물을 어드민이
-- 만든다(MVP 비목표). 그래서 "내 게시물에 댓글/좋아요"는 받을 사람이
-- 없다. 남는 것은 내 댓글에 달린 답글과 내 댓글에 눌린 좋아요뿐이다.
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('reply', 'comment_like')),
  -- 알림의 대상 댓글. 답글이면 그 답글, 좋아요면 좋아요받은 댓글.
  comment_id uuid not null references public.comments (id) on delete cascade,
  -- 딥링크용. comment_id로 유도할 수도 있지만 조인 없이 URL을 만들려고 둔다.
  post_id uuid not null references public.posts (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- 목록은 항상 "내 알림을 최신순으로"다.
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

-- 받은 사람만 읽고, 받은 사람만 읽음 처리한다.
-- insert 정책이 없는 이유: 행은 security definer 트리거만 만든다.
-- 정책을 열어두면 클라이언트가 남에게 알림을 보낼 수 있다.
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = recipient_id);
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- read_at 외의 컬럼을 클라이언트가 바꾸지 못하게 한다.
-- 2단계에서 배운 것: RLS는 UPDATE가 어떤 컬럼을 건드리는지 제한하지
-- 못하고, Supabase 기본 권한이 테이블 단위 UPDATE를 이미 부여해 두므로
-- 컬럼 단위 revoke만으로는 걷히지 않는다(§11-45). 테이블 단위를 걷고
-- 필요한 컬럼만 다시 준다.
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------------
-- 답글 알림. 부모 댓글 작성자에게 보낸다.
--
-- 본인이 본인에게 다는 답글은 만들지 않는다 — 알림함이 자기 글로
-- 채워지면 배지가 신호가 아니라 소음이 된다.
-- ------------------------------------------------------------
create function public.notify_on_reply()
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
  if not found or v_parent.user_id = new.user_id then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, type, comment_id, post_id)
  values
    (v_parent.user_id, new.user_id, 'reply', new.id, new.post_id);

  return new;
end;
$fn$;

create trigger on_reply_notify
  after insert on public.comments
  for each row execute function public.notify_on_reply();

-- ------------------------------------------------------------
-- 좋아요 알림. 댓글 작성자에게 보낸다.
--
-- 삭제된 댓글에는 만들지 않는다 — 눌러도 갈 곳이 없다.
-- 좋아요를 취소해도 알림은 지우지 않는다: 이미 읽은 알림이 사라지면
-- 목록이 과거를 다시 쓰는 것처럼 보인다.
-- ------------------------------------------------------------
create function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_comment public.comments%rowtype;
begin
  select * into v_comment from public.comments where id = new.comment_id;
  if not found
     or v_comment.deleted_at is not null
     or v_comment.user_id = new.user_id then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, type, comment_id, post_id)
  values
    (v_comment.user_id, new.user_id, 'comment_like', v_comment.id, v_comment.post_id);

  return new;
end;
$fn$;

create trigger on_comment_like_notify
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();
```

- [ ] **Step 2: 적용**

```bash
npx supabase db reset
npm run seed
```

기대: 마이그레이션 17개가 오류 없이 적용되고 마지막이 `20260903000002_notifications.sql`이다.

- [ ] **Step 3: 답글 알림을 SQL로 검증**

Auth 관리자 API로 사용자 A·B를 만든다(service-role 키는 `npx supabase status`). `<A>`·`<B>`·`<post>`는 실제 값으로 치환한다.

```sql
begin;

insert into public.comments (post_id, user_id, content)
values ('<post>', '<A>', 'A의 루트');

-- B가 A의 댓글에 답글 → A에게 알림
insert into public.comments (post_id, user_id, content, parent_id)
select '<post>', '<B>', 'B의 답글', id
  from public.comments where content = 'A의 루트';

-- A가 자기 댓글에 답글 → 알림 없어야 한다
insert into public.comments (post_id, user_id, content, parent_id)
select '<post>', '<A>', 'A의 자기답글', id
  from public.comments where content = 'A의 루트';

select n.type, n.recipient_id = '<A>' as to_a, c.content as about
  from public.notifications n
  join public.comments c on c.id = n.comment_id;

rollback;
```

기대: 행이 **정확히 1개**. `type='reply'`, `to_a=t`, `about='B의 답글'`.

- [ ] **Step 4: 좋아요 알림과 자기 좋아요 제외를 검증**

```sql
begin;

insert into public.comments (post_id, user_id, content)
values ('<post>', '<A>', 'A의 댓글');

insert into public.comment_likes (user_id, comment_id)
select '<B>', id from public.comments where content = 'A의 댓글';

-- A가 자기 댓글에 좋아요 → 알림 없어야 한다
insert into public.comment_likes (user_id, comment_id)
select '<A>', id from public.comments where content = 'A의 댓글';

select count(*) as notif_count from public.notifications;

rollback;
```

기대: `notif_count = 1`.

- [ ] **Step 5: 삭제된 댓글에는 좋아요 알림이 안 생기는지 검증**

```sql
begin;

insert into public.comments (post_id, user_id, content)
values ('<post>', '<A>', '지울 댓글');

update public.comments set deleted_at = now() where content = '지울 댓글';

insert into public.comment_likes (user_id, comment_id)
select '<B>', id from public.comments where content = '지울 댓글';

select count(*) as notif_count from public.notifications;

rollback;
```

기대: `notif_count = 0`.

- [ ] **Step 6: read_at 외 컬럼이 막히는지 검증**

인증 신원을 잡고(`set local role authenticated;` + `set local "request.jwt.claims" = '{"sub":"<A>","role":"authenticated"}';`) A로서 두 UPDATE를 시도한다.

```sql
-- 되어야 한다
update public.notifications set read_at = now();
-- 거부되어야 한다
update public.notifications set recipient_id = '<B>';
```

기대: 첫 번째 성공, 두 번째 `permission denied`.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/20260903000002_notifications.sql
git commit -m "feat(db): 알림 테이블·트리거 2종 — 답글·댓글 좋아요"
```

---

## Task 2: 데이터 계층 — 조회·읽음·묶음

**Files:**
- Create: `src/lib/notifications.ts`
- Create: `src/lib/notifications-client.ts`
- Create: `src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: Task 1의 `notifications`
- Produces:
  - `type NotificationRow = { id; type: "reply" | "comment_like"; commentId; postId; readAt: string | null; createdAt; actorNickname: string; commentExcerpt: string }`
  - `type NotificationGroup = { key; type; commentId; postId; createdAt; unread: boolean; ids: string[]; actorNames: string[]; excerpt: string }`
  - `groupNotifications(rows: NotificationRow[]): NotificationGroup[]`
  - `getNotifications(): Promise<NotificationGroup[]>`
  - `markRead(ids: string[]): Promise<void>` — **`notifications-client.ts`** 쪽

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다 (RED)**

`src/lib/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupNotifications, type NotificationRow } from "@/lib/notifications";

function row(over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n1",
    type: "comment_like",
    commentId: "c1",
    postId: "p1",
    readAt: null,
    createdAt: "2026-09-03T00:00:00Z",
    actorNickname: "가",
    commentExcerpt: "내 댓글",
    ...over,
  };
}

describe("groupNotifications", () => {
  it("같은 댓글의 좋아요를 하나로 묶는다", () => {
    const out = groupNotifications([
      row({ id: "n1", actorNickname: "가" }),
      row({ id: "n2", actorNickname: "나" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].ids).toEqual(["n1", "n2"]);
    expect(out[0].actorNames).toEqual(["가", "나"]);
  });

  it("다른 댓글의 좋아요는 따로 묶는다", () => {
    const out = groupNotifications([
      row({ id: "n1", commentId: "c1" }),
      row({ id: "n2", commentId: "c2" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("답글은 묶지 않는다 — 내용도 목적지도 제각각이다", () => {
    const out = groupNotifications([
      row({ id: "n1", type: "reply", commentId: "c1" }),
      row({ id: "n2", type: "reply", commentId: "c1" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.ids.length === 1)).toBe(true);
  });

  it("묶음 안에 안 읽은 것이 하나라도 있으면 묶음이 안 읽음이다", () => {
    const out = groupNotifications([
      row({ id: "n1", readAt: "2026-09-03T01:00:00Z" }),
      row({ id: "n2", readAt: null }),
    ]);
    expect(out[0].unread).toBe(true);
  });

  it("전부 읽었으면 묶음도 읽음이다", () => {
    const out = groupNotifications([
      row({ id: "n1", readAt: "t" }),
      row({ id: "n2", readAt: "t" }),
    ]);
    expect(out[0].unread).toBe(false);
  });

  it("묶음의 시각은 가장 최근 것이다", () => {
    const out = groupNotifications([
      row({ id: "n1", createdAt: "2026-09-03T00:00:00Z" }),
      row({ id: "n2", createdAt: "2026-09-03T05:00:00Z" }),
    ]);
    expect(out[0].createdAt).toBe("2026-09-03T05:00:00Z");
  });

  it("같은 사람이 두 번 눌러도 이름은 한 번만 나온다", () => {
    const out = groupNotifications([
      row({ id: "n1", actorNickname: "가" }),
      row({ id: "n2", actorNickname: "가" }),
    ]);
    expect(out[0].actorNames).toEqual(["가"]);
  });

  it("입력 순서(최신순)를 묶음 순서로 유지한다", () => {
    const out = groupNotifications([
      row({ id: "n1", type: "reply", commentId: "c9" }),
      row({ id: "n2", commentId: "c1" }),
    ]);
    expect(out.map((g) => g.type)).toEqual(["reply", "comment_like"]);
  });

  it("빈 입력은 빈 배열", () => {
    expect(groupNotifications([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

```bash
npx vitest run src/lib/notifications.test.ts
```

기대: `Failed to resolve import "@/lib/notifications"`.

- [ ] **Step 3: `notifications.ts`를 구현한다 (GREEN)**

```ts
import { createClient } from "@/lib/supabase/server";

/** 목록 상한. 개인 알림함이라 페이지네이션 없이 최근 것만 보여준다. */
const NOTIFICATION_LIMIT = 50;

export type NotificationRow = {
  id: string;
  type: "reply" | "comment_like";
  commentId: string;
  postId: string;
  readAt: string | null;
  createdAt: string;
  actorNickname: string;
  commentExcerpt: string;
};

export type NotificationGroup = {
  /** 묶음 식별자. 좋아요는 댓글별로 묶이고 답글은 알림 자체가 단위다. */
  key: string;
  type: "reply" | "comment_like";
  commentId: string;
  postId: string;
  createdAt: string;
  unread: boolean;
  /** 이 묶음이 덮는 알림 id들. 탭하면 이 전부를 읽음 처리한다. */
  ids: string[];
  actorNames: string[];
  excerpt: string;
};

/**
 * 좋아요만 묶는다 (결정 16).
 *
 * 답글을 묶지 않는 이유: 묶으면 딥링크 목적지가 여럿이 되어 "해당 답글로
 * 정확히 간다"(결정 13)가 성립하지 않고, 답글은 내용도 목적지도 제각각이라
 * 묶는 순간 정보가 사라진다.
 *
 * 입력이 최신순이라는 전제로 순서를 유지한다 — Map은 삽입 순서를 지킨다.
 */
export function groupNotifications(
  rows: NotificationRow[],
): NotificationGroup[] {
  const byKey = new Map<string, NotificationGroup>();

  for (const r of rows) {
    // 답글은 알림 하나가 곧 묶음이라 id를 키로 써서 절대 합쳐지지 않게 한다.
    const key = r.type === "reply" ? `reply:${r.id}` : `like:${r.commentId}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        type: r.type,
        commentId: r.commentId,
        postId: r.postId,
        createdAt: r.createdAt,
        unread: r.readAt === null,
        ids: [r.id],
        actorNames: [r.actorNickname],
        excerpt: r.commentExcerpt,
      });
      continue;
    }

    existing.ids.push(r.id);
    // 하나라도 안 읽었으면 묶음은 안 읽음이다 — 읽은 것에 묻혀 새 좋아요를
    // 놓치지 않게.
    existing.unread = existing.unread || r.readAt === null;
    // 입력이 최신순이지만 순서를 신뢰하지 않고 비교한다.
    if (r.createdAt > existing.createdAt) existing.createdAt = r.createdAt;
    if (!existing.actorNames.includes(r.actorNickname)) {
      existing.actorNames.push(r.actorNickname);
    }
  }

  return [...byKey.values()];
}

/**
 * 내 알림 목록.
 *
 * RLS(notifications_select_own)가 본인 행만 주므로 recipient_id 조건을
 * 쓰지 않는다 — 정책이 이미 좁혀주는 표에서 다시 거르면 규칙이 두 곳에
 * 생긴다(§11-46).
 *
 * actor 임베드에 FK를 밝히는 이유: notifications가 profiles를
 * recipient_id와 actor_id 두 번 가리켜 임베드가 모호하다. 2단계에서
 * comment_likes 때문에 comments↔profiles가 모호해져 모든 댓글 조회가
 * 300으로 죽은 적이 있다 — 같은 종류다.
 */
export async function getNotifications(): Promise<NotificationGroup[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("notifications")
    .select(
      "id, type, comment_id, post_id, read_at, created_at, " +
        "actor:profiles!notifications_actor_id_fkey ( nickname ), " +
        "comments ( content )",
    )
    .order("created_at", { ascending: false })
    .limit(NOTIFICATION_LIMIT);

  if (error) {
    console.error("getNotifications:", error.message);
    return [];
  }

  const rows: NotificationRow[] = (
    data as unknown as {
      id: string;
      type: "reply" | "comment_like";
      comment_id: string;
      post_id: string;
      read_at: string | null;
      created_at: string;
      actor: { nickname: string } | null;
      comments: { content: string } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    type: r.type,
    commentId: r.comment_id,
    postId: r.post_id,
    readAt: r.read_at,
    createdAt: r.created_at,
    actorNickname: r.actor?.nickname ?? "독자",
    commentExcerpt: r.comments?.content ?? "",
  }));

  return groupNotifications(rows);
}
```

- [ ] **Step 4: 읽음 처리를 별도 파일에 둔다**

읽음 처리는 브라우저에서 일어나므로 서버 클라이언트를 쓰는 위 파일에 넣을 수 없다 (`docs/FRONTEND.md` §5, 혼용 금지).

`src/lib/notifications-client.ts`:

```ts
import { createClient } from "@/lib/supabase/client";

/**
 * 알림을 읽음 처리한다. 묶인 좋아요는 묶음이 덮는 id 전부를 한 번에 넘긴다.
 *
 * read_at 외의 컬럼은 권한이 없어 애초에 쓸 수 없다(Task 1의 grant).
 * 파일이 나뉜 이유는 서버·클라이언트 Supabase 클라이언트 혼용 금지다.
 */
export async function markRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await createClient()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: 통과를 확인한다 (GREEN)**

```bash
npx vitest run
```

기대: `54 passed` (기존 45 + 이번 9). 잡음 없음.

- [ ] **Step 6: 빌드**

```bash
npm run build
```

기대: 성공. 타입 오류 0건.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/notifications.ts src/lib/notifications-client.ts src/lib/notifications.test.ts
git commit -m "feat(notifications): 알림 조회·읽음 처리 + 좋아요 묶음"
```

---

## Task 3: 알림 목록 화면

**Files:**
- Create: `src/components/notifications/notification-row.tsx`
- Create: `src/app/(main)/notifications/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `getNotifications`, `NotificationGroup`, `markRead`
- Produces: `/notifications` 라우트, `NotificationRow`

- [ ] **Step 1: 알림 한 줄 컴포넌트**

`src/components/notifications/notification-row.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle } from "lucide-react";
import { markRead } from "@/lib/notifications-client";
import { timeAgo } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { NotificationGroup } from "@/lib/notifications";

/** "가님 외 3명이" — 이름을 다 늘어놓으면 한 줄에 안 들어간다. */
function actorLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]}님이`;
  return `${names[0]}님 외 ${names.length - 1}명이`;
}

/**
 * 알림 한 줄 (설계 결정 15).
 *
 * 읽음은 **탭해야** 처리된다 — 목록에 들어온 것만으로 일괄 처리하면
 * 훑고 지나간 알림까지 사라져 무엇을 못 봤는지 알 수 없다.
 *
 * 낙관적으로 먼저 읽음 표시를 지우고 이동한다: 서버 왕복을 기다리면
 * 탭한 뒤에도 안 읽음 배경이 남아 눌리지 않은 것처럼 보인다.
 *
 * 안 읽음을 배경과 점 두 가지로 말하는 이유: 상태를 색으로만 말하지
 * 않는다 (DESIGN.md Colors).
 */
export function NotificationRow({ group }: { group: NotificationGroup }) {
  const [unread, setUnread] = useState(group.unread);
  const router = useRouter();
  const Icon = group.type === "reply" ? MessageCircle : Heart;

  const text =
    group.type === "reply"
      ? `${actorLabel(group.actorNames)} 회원님의 댓글에 답글을 남겼어요`
      : `${actorLabel(group.actorNames)} 회원님의 댓글을 좋아합니다`;

  function open() {
    if (unread) {
      setUnread(false);
      void markRead(group.ids).catch(() => setUnread(true));
    }
    router.push(`/p/${group.postId}?comment=${group.commentId}`);
  }

  return (
    <li>
      <button
        type="button"
        onClick={open}
        className={cn(
          "focus-visible:ring-ring flex min-h-11 w-full items-start gap-3 rounded-lg p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
          unread ? "bg-accent" : "hover:bg-accent",
        )}
      >
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", unread && "fill-current")}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm leading-relaxed break-keep">{text}</span>
          {group.excerpt ? (
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {group.excerpt}
            </span>
          ) : null}
          <span className="text-muted-foreground text-xs">
            {timeAgo(group.createdAt)}
          </span>
        </span>
        {unread ? (
          <span
            aria-label="읽지 않음"
            className="bg-foreground mt-2 size-2 shrink-0 rounded-full"
          />
        ) : null}
      </button>
    </li>
  );
}
```

- [ ] **Step 2: 목록 화면**

`src/app/(main)/notifications/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationRow } from "@/components/notifications/notification-row";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";

export const metadata: Metadata = { title: "알림" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  // 알림은 본인 것뿐이라 게스트에게 보여줄 내용이 없다.
  if (!user) redirect("/login?next=/notifications");

  const groups = await getNotifications();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h1 className="text-lg font-bold break-keep">알림</h1>

      {groups.length ? (
        <ul className="flex flex-col gap-1">
          {groups.map((g) => (
            <NotificationRow key={g.key} group={g} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">
          아직 알림이 없어요.
        </p>
      )}
    </div>
  );
}
```

`/login`이 `next` 파라미터를 받는지 먼저 확인하고, 안 받으면 그냥 `/login`으로 보낸다.

- [ ] **Step 3: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `54 passed`, 빌드 성공, `/notifications` 라우트가 생성 목록에 나온다.

- [ ] **Step 4: 375px에서 확인**

사용자 A·B로 답글·좋아요를 만들어 알림을 쌓은 뒤 A로 로그인해 `/notifications`에서 확인한다. **검증이 의미를 가지려면 픽스처가 그 케이스를 실제로 포함해야 한다** — 같은 댓글 좋아요 2개, 같은 댓글 답글 2개, A가 자기 글에 한 행위를 모두 만들어 둔다.

1. 답글 알림과 좋아요 알림이 각각 다른 아이콘·문구로 뜬다
2. 같은 댓글에 좋아요 2개면 `○○님 외 1명이`로 **한 줄**이다
3. 같은 댓글에 답글 2개면 **두 줄**이다
4. 안 읽은 줄은 배경과 점 두 가지로 구분된다
5. 탭하면 읽음 표시가 즉시 사라지고 `/p/[postId]?comment=…`로 이동한다
6. 돌아오면 그 줄이 읽음 상태다
7. A가 자기 댓글에 단 답글·좋아요는 알림에 **없다**
8. 알림이 없으면 빈 상태 문구가 뜬다
9. 로그아웃 상태로 `/notifications`에 가면 로그인으로 보낸다
10. 각 줄의 터치 타깃이 44px 이상이다

- [ ] **Step 5: 커밋**

```bash
git add src/components/notifications/notification-row.tsx "src/app/(main)/notifications/page.tsx"
git commit -m "feat(notifications): 알림 목록 화면 + 개별 읽음 처리"
```

---

## Task 4: 딥링크 — 대상 댓글 핀

**Files:**
- Modify: `src/lib/comments.ts`
- Modify: `src/components/feed/comment-item.tsx`
- Modify: `src/components/feed/comment-sheet.tsx`
- Modify: `src/components/feed/action-bar.tsx`
- Modify: `src/components/feed/post-item.tsx`
- Modify: `src/app/(main)/p/[postId]/page.tsx`

**Interfaces:**
- Consumes: Task 3이 만드는 `?comment=<id>` 파라미터
- Produces:
  - `fetchCommentContext(commentId: string): Promise<{ root: Comment; target: Comment } | null>`
  - `CommentSheet`·`ActionBar`·`PostItem`에 `pinnedCommentId?: string`
  - `CommentItem`·`CommentRow`에 `highlightId?: string`

- [ ] **Step 1: 대상 댓글 문맥 조회를 추가한다**

`src/lib/comments.ts`의 `fetchReplyPage` 아래에 넣는다:

```ts
/**
 * 딥링크 대상 댓글 하나. 답글이면 그 부모까지 함께 가져온다.
 *
 * 목록을 뒤져 스크롤하지 않고 최상단에 고정해 보여주기 위한 조회다
 * (결정 13) — 페이지네이션 깊이와 무관하게 항상 성립하고 왕복이 한 번이다.
 * 유튜브가 알림에서 들어왔을 때 하는 것과 같다.
 *
 * 삭제된 댓글이면 null을 준다 — 눌러도 갈 곳이 없으니 고정 블록을
 * 그리지 않고 시트만 연다.
 */
export async function fetchCommentContext(
  commentId: string,
): Promise<{ root: Comment; target: Comment } | null> {
  const db = createClient();

  const { data, error } = await db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("id", commentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  const base = data as unknown as Omit<Comment, "reply_count" | "liked">;
  const target: Comment = { ...base, reply_count: 0, liked: false };
  if (!target.parent_id) return { root: target, target };

  const { data: parentRow } = await db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("id", target.parent_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!parentRow) return null;
  const parentBase = parentRow as unknown as Omit<
    Comment,
    "reply_count" | "liked"
  >;
  return {
    root: { ...parentBase, reply_count: 0, liked: false },
    target,
  };
}
```

- [ ] **Step 2: 강조 표시를 `CommentItem`에 더한다**

`comment-item.tsx`의 `CommentItem`과 `CommentRow`에 `highlightId?: string`를 더한다. `CommentRow`가 자기 id와 같으면 강조한다:

```tsx
      className={cn(
        "flex gap-3",
        highlightId === comment.id &&
          "border-foreground bg-accent -ml-2 rounded-md border-l-2 pl-2",
      )}
```

`<li className="flex gap-3">`를 위 형태로 바꾸고 `cn`을 import한다.

> 강조를 배경과 왼쪽 굵은 선 두 가지로 주는 이유: 상태를 색으로만 말하지 않는다 (DESIGN.md Colors).

`CommentItem`은 받은 `highlightId`를 자기 `CommentRow`와 답글 `CommentRow` 양쪽에 그대로 내려보낸다.

- [ ] **Step 3: 시트가 핀을 그리게 한다**

`CommentSheet`에 prop을 더한다:

```tsx
  pinnedCommentId,
```

```tsx
  /** 알림에서 들어온 대상 댓글. 있으면 시트를 열고 최상단에 고정한다. */
  pinnedCommentId?: string;
```

자동 열기와 문맥 조회:

```tsx
  // 알림에서 들어오면 시트가 이미 열려 있어야 한다 — 한 번 더 누르게
  // 하면 알림을 탭한 의미가 없다.
  useEffect(() => {
    if (pinnedCommentId) setOpen(true);
  }, [pinnedCommentId]);

  const pinned = useQuery({
    queryKey: ["comment-context", pinnedCommentId],
    queryFn: () => fetchCommentContext(pinnedCommentId!),
    enabled: open && !!pinnedCommentId,
  });
```

`useQuery`와 `fetchCommentContext`를 import한다.

`ScrollArea` 안, 목록 `<ul>` 바로 앞에 고정 블록을 넣는다:

```tsx
          {pinned.data ? (
            <div className="border-border mb-4 rounded-lg border p-2">
              <p className="text-muted-foreground mb-2 text-xs">
                알림에서 온 댓글
              </p>
              <ul className="flex flex-col gap-4">
                <CommentItem
                  comment={pinned.data.root}
                  actions={actions}
                  onReply={setReplyTo}
                  expandFor={
                    pinned.data.target.id !== pinned.data.root.id
                      ? pinned.data.root.id
                      : null
                  }
                  highlightId={pinned.data.target.id}
                />
              </ul>
            </div>
          ) : null}
```

> 대상이 답글이면 `expandFor`로 부모를 펼쳐 답글이 보이게 한다 — 3단계에서 만든 소비형 확장 신호를 그대로 쓴다.

- [ ] **Step 4: 파라미터를 통과시킨다**

`ActionBar`에 `pinnedCommentId?: string`를 더해 `CommentSheet`로 넘기고, `PostItem`도 같은 prop을 받아 `ActionBar`로 넘긴다.

`src/app/(main)/p/[postId]/page.tsx`가 `searchParams`의 `comment`를 읽어 `PostItem`으로 내려보낸다.

**이 파일은 Next 16의 타입 헬퍼 `PageProps<"/p/[postId]">`를 쓴다.** 손으로 쓴 `{ params: Promise<…> }` 타입으로 **바꾸지 말 것** — 그 헬퍼가 `params`와 `searchParams`를 이미 함께 제공한다. 구조 분해에 `searchParams`를 더하기만 한다:

```tsx
export default async function PostPage({
  params,
  searchParams,
}: PageProps<"/p/[postId]">) {
  const { postId } = await params;
  const { comment } = await searchParams;
  // …기존 로직 그대로…
  // <PostItem … pinnedCommentId={typeof comment === "string" ? comment : undefined} />
}
```

`searchParams`의 값은 `string | string[] | undefined`이므로 문자열일 때만 넘긴다 — `?comment=a&comment=b`로 배열이 들어오면 그대로 넘길 수 없다.

- [ ] **Step 5: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `54 passed`, 빌드 성공.

- [ ] **Step 6: 375px에서 딥링크를 확인**

댓글이 20개를 넘는 게시물을 하나 만들어 두고(대상이 첫 페이지 밖에 있는 경우를 만들기 위해) 확인한다.

1. 답글 알림을 탭하면 게시물로 이동하며 **댓글 시트가 이미 열려 있다**
2. 대상 답글의 부모가 최상단 고정 블록에 보인다
3. 답글이 펼쳐져 있고 대상 답글이 강조돼 있다
4. 좋아요 알림을 탭하면 좋아요받은 댓글 자체가 고정돼 보인다
5. 고정 블록 아래로 일반 목록이 이어진다
6. **대상이 첫 페이지 밖(21번째 이후)이어도 고정은 정상이다**
7. 삭제된 댓글을 가리키는 알림을 탭하면 고정 블록 없이 시트만 열린다
8. `?comment=` 없이 들어가면 시트가 자동으로 열리지 않는다

- [ ] **Step 7: 커밋**

```bash
git add src/lib/comments.ts src/components/feed/comment-item.tsx src/components/feed/comment-sheet.tsx src/components/feed/action-bar.tsx src/components/feed/post-item.tsx "src/app/(main)/p/[postId]/page.tsx"
git commit -m "feat(feed): 알림 딥링크 — 대상 댓글을 시트 최상단에 고정"
```

---

## Task 5: 상단 바 — 로고·알림 종·배지

**Files:**
- Create: `src/components/feed/unread-badge.tsx`
- Create: `src/components/feed/top-bar.tsx`
- Modify: `src/components/feed/post-item.tsx` (상단 스크림)
- Modify: `src/components/feed/chrome.ts` (세이프존 상단)
- Modify: `src/app/(main)/page.tsx` (상단 바 배치)

**Interfaces:**
- Consumes: Task 1의 `notifications`
- Produces: `TopBar`, `UnreadBadge`

- [ ] **Step 1: 배지 (60초 폴링)**

`src/components/feed/unread-badge.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * 안 읽은 알림 수 (결정 14).
 *
 * 60초 폴링 + 창 포커스로 갱신한다. 릴스형 피드는 사용자가 라우트를 안
 * 바꾸고 계속 스크롤하므로 진입 시 조회만으로는 배지가 계속 0으로 보인다.
 * Realtime을 쓰지 않는 이유: 하루 몇 건 볼륨에 WebSocket 상주가 과하고
 * 이 저장소에 Realtime 선례가 없다.
 *
 * 전역 기본값이 refetchOnWindowFocus: false라 여기서만 켠다.
 * RLS(notifications_select_own)가 본인 행만 주므로 recipient 조건이 없다.
 */
export function UnreadBadge() {
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => {
      const { count } = await createClient()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!data) return null;

  return (
    <span
      aria-label={`읽지 않은 알림 ${data}개`}
      className="absolute -top-0.5 -right-0.5 flex min-h-4.5 min-w-4.5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-[#111111] tabular-nums"
    >
      {data > 99 ? "99+" : data}
    </span>
  );
}
```

> 흰 바탕에 어두운 글씨인 이유: 피드 크롬은 흰색 고정 구역이라 시맨틱 토큰을 쓰지 않는다 (DESIGN.md Colors). `CHROME_CTA_ICON`이 같은 반전을 쓴다.
> **`text-xs`(12px)를 쓰는 이유**: DESIGN.md의 12px 하한을 지킨다. 같은 파일의 `CHROME_COUNT`가 `text-xs = 12px로 하한을 지킨다`고 명시하고 있어, 배지만 10px로 내리면 저장소가 이미 지키는 규칙에 예외를 새로 만드는 셈이다. 배지 숫자 하나 때문에 디자인 시스템에 예외 조항을 늘리지 않는다. **10px로 내리지 말 것** — 내리려면 DESIGN.md를 먼저 고쳐야 하고, 그건 이 단계의 범위가 아니다.

- [ ] **Step 2: 상단 바**

`src/components/feed/top-bar.tsx`:

```tsx
import Link from "next/link";
import { Bell } from "lucide-react";
import { UnreadBadge } from "@/components/feed/unread-badge";
import { CHROME_ACTION, CHROME_ICON } from "@/components/feed/chrome";

/**
 * 홈 상단 오버레이 바 (설계 결정 12).
 *
 * 구조적 형제가 아니라 **크롬 레이어**(z-[3])다 — §11-27이 "홈의 구조적
 * 형제는 하단 액션 바와 컨텐츠 영역 둘뿐"이라고 정했고, 구조적 헤더를
 * 넣으면 스냅 높이가 바뀌어 전면감이 깨진다. 인스타 릴스도 상단 요소를
 * 오버레이로 얹는다.
 *
 * 홈 전용이다. 탐색·프로필은 자체 헤더가 있거나 필요 없다.
 */
export function TopBar({ isGuest }: { isGuest: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-[3] flex h-14 items-center justify-between px-3">
      <span className="feed-chrome-text text-base font-bold text-white">
        똑똑
      </span>

      <Link
        href={isGuest ? "/login?next=/notifications" : "/notifications"}
        aria-label="알림"
        className={`${CHROME_ACTION} relative`}
      >
        <Bell className={CHROME_ICON} aria-hidden />
        {isGuest ? null : <UnreadBadge />}
      </Link>
    </header>
  );
}
```

- [ ] **Step 3: 상단 스크림을 더한다**

`post-item.tsx`의 하단 스크림 바로 위에 상단 스크림을 넣는다:

```tsx
      {/* z-2 — 상단 스크림. 상단 바(z-3)가 흰색 고정이라 밝은 커버 위에서
          읽히려면 대비가 필요하다. 하단과 같은 이징이라 띠가 안 보인다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-24"
        style={{
          background:
            "linear-gradient(to bottom, rgb(0 0 0 / 0.38) 0%, rgb(0 0 0 / 0.22) 35%, rgb(0 0 0 / 0.12) 60%, rgb(0 0 0 / 0.05) 80%, transparent 100%)",
        }}
      />
```

- [ ] **Step 4: 세이프존 상단을 재계산한다**

`chrome.ts`의 주석이 지금 `상단 20px은 피할 크롬이 없는 순수 시각 여백이다`라고 말하는데 상단 바가 생기면 거짓이 된다. 좌우·하단과 같은 산식으로 바꾼다:

```ts
/**
 * 카드 본문 세이프존. 크롬이 컨텐츠 위에 얹히므로 본문이 스스로 피한다.
 * 좌우 각 60px = 레일 우측 여백 8 + 레일 폭 44 + 여유 8. 좌우가 대칭이라야
 * 중앙정렬 콘텐츠가 프레임 중심에서 안 밀린다.
 * 하단 96px = 바 하단 여백 12 + 도서 바 76 + 여유 8.
 * 상단 64px = 상단 바 56 + 여유 8. 예전에는 피할 크롬이 없어 순수 시각
 * 여백 20px이었는데, 상단 바(결정 12)가 생기면서 좌우·하단과 같은 산식이 됐다.
 */
export const CHROME_SAFE_AREA = "px-15 pt-16 pb-24";
```

- [ ] **Step 5: 홈에 배치한다**

`src/app/(main)/page.tsx`는 지금 `<FeedScroller>`를 곧바로 반환한다. `FeedScroller`의 루트가 `h-full … overflow-y-auto`인 **스크롤 컨테이너 그 자체**라, 상단 바를 그 안에 넣으면 스크롤을 따라 올라가 사라진다. 스크롤 컨테이너 **바깥**에 형제로 두어야 한다.

`(main)/layout.tsx`의 `<main className="min-h-0 flex-1">`에는 `relative`가 없으므로 절대 배치의 기준을 여기서 만든다. 반환문을 이렇게 감싼다:

```tsx
  return (
    // relative — TopBar가 잡을 기준. h-full로 main을 채워야 FeedScroller가
    // 자기 높이를 알고 스냅이 성립한다(layout.tsx의 min-h-0과 짝).
    <div className="relative h-full">
      <FeedScroller … >
        {/* 기존 그대로 */}
      </FeedScroller>
      <TopBar isGuest={isGuest} />
    </div>
  );
```

`isGuest`는 이미 이 파일이 계산해 두었다. `TopBar`를 `FeedScroller` **뒤에** 두어 z 순서를 명시적으로 만든다.

- [ ] **Step 6: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `54 passed`, 빌드 성공.

- [ ] **Step 7: 375px에서 확인**

1. 홈 상단에 왼쪽 `똑똑`, 오른쪽 종이 보이고 영상·카드 위에 떠 있다
2. 상단 스크림이 있어 밝은 커버 위에서도 로고와 종이 읽힌다
3. **카드 본문이 상단 바와 겹치지 않는다** (세이프존 재계산 확인 — 실측)
4. 안 읽은 알림이 있으면 종에 배지 숫자가 뜬다
5. 알림을 읽고 돌아오면 배지가 줄어든다 (창 포커스 갱신)
6. 게스트는 종을 눌렀을 때 로그인으로 간다
7. 종의 터치 타깃이 44px 이상이다 (실측)
8. 탐색·프로필 화면에는 상단 바가 없다
9. **스냅 스크롤이 여전히 정상이다** — 상단 바가 스크롤을 따라 움직이지 않는다
10. 라이트·다크 모두에서 로고와 종이 흰색으로 고정이다

- [ ] **Step 8: 커밋**

```bash
git add src/components/feed/unread-badge.tsx src/components/feed/top-bar.tsx src/components/feed/post-item.tsx src/components/feed/chrome.ts "src/app/(main)/page.tsx"
git commit -m "feat(feed): 홈 상단 오버레이 바 — 로고·알림 종·배지"
```

---

## Task 6: 문서 갱신

**Files:**
- Modify: `docs/prd-ttokttok.md`
- Modify: `docs/DESIGN.md`

- [ ] **Step 1: PRD를 갱신한다**

- **§4 IA**: `알림 (/notifications)` 추가
- **§5.1 공통 UI**: 상단 오버레이 바(로고 + 알림 종)와 상단 스크림을 추가하고, 세이프존 수치를 `상단 64px`로 고친다 — 현재 `상단 20px`이라 적혀 있다
- **§5.5 표**: 알림 행 추가 (대상 2종, 좋아요만 묶음, 개별 탭 읽음, 60초 폴링)
- **§6**: `notifications` 표 정의 추가
- **§11**: 마지막 행 번호를 **확인하고** 그 다음 번호로 결정 기록 추가. 담을 것 — 트리거가 만드는 이유(경로가 둘), 대상이 2종뿐인 이유(UGC 아님), 좋아요만 묶는 이유(딥링크 목적지), 개별 읽음, 폴링을 택하고 Realtime을 버린 이유, 핀 방식 딥링크, 상단 바를 오버레이로 둔 이유와 §11-27과의 관계

- [ ] **Step 2: DESIGN.md를 갱신한다**

- **Colors 절의 스크림 서술**이 지금 하단만 말한다 — 상단 스크림(높이·알파)을 더한다
- **Layout의 피드 세이프존 수치**가 `상단 20px`이라면 `상단 64px`로 고친다
- **Typography는 건드리지 않는다** — 배지가 `text-xs`라 12px 하한을 지킨다. 이 줄은 "확인했고 바꿀 것이 없다"는 뜻이지, 빠뜨린 항목이 아니다.

- [ ] **Step 3: 확인**

```bash
grep -n "알림" docs/prd-ttokttok.md
```

기대: §4·§5.1·§5.5·§6·§11에 나온다.

```bash
grep -n "상단 20px\|상단 64px" docs/prd-ttokttok.md docs/DESIGN.md src/components/feed/chrome.ts
```

기대: `상단 20px`이 어디에도 남아 있지 않다.

- [ ] **Step 4: 커밋**

```bash
git add docs/prd-ttokttok.md docs/DESIGN.md
git commit -m "docs: 알림 명세와 상단 바 결정 기록 반영"
```

---

## 4단계 완료 기준

- [ ] `npx vitest run` — 54 passed, 잡음 없음
- [ ] `npm run build` 통과
- [ ] Task 1 Step 3~6의 SQL 검증 (답글·좋아요 알림, 자기 행위 제외, 삭제 댓글 제외, 컬럼 권한)
- [ ] Task 3 Step 4의 렌더 검증 10항목
- [ ] Task 4 Step 6의 딥링크 검증 8항목
- [ ] Task 5 Step 7의 상단 바 검증 10항목
- [ ] PRD·DESIGN.md가 실제 동작과 일치하고 `상단 20px`이 남아 있지 않다

## 설계 결정 대조표

| 결정 | 내용 | 구현 위치 |
|---|---|---|
| 12 | 진입점 = 홈 상단 오버레이 바 | Task 5 |
| 13 | 딥링크 = 핀 방식 | Task 4 |
| 14 | 배지 = 60초 폴링 + 포커스 | Task 5 Step 1 |
| 15 | 읽음 = 개별 탭 | Task 3 Step 1 |
| 16 | 묶음 = 좋아요만 | Task 2 `groupNotifications` |
| 17 | 대상 2종 + 본인 제외 | Task 1 두 트리거 |

## 이 단계에서 하지 않는 것

- **Realtime.** 결정 14가 폴링을 택했다.
- **푸시 알림.** PWA 푸시는 MVP 비목표다.
- **알림 설정 화면.** 대상 이벤트가 2종뿐인 지금 고를 것이 없다.
- **읽음 일괄 처리.** 결정 15가 개별 탭을 택했다.
- **알림 페이지네이션.** 최근 50개로 자른다. 넘치면 그때 키셋을 붙인다(1단계에 선례가 있다).

## 별건으로 남긴 것 (사용자 결정)

**IA 개편** — 홈을 게시글 카드 피드로 바꾸고 현재 전면 피드를 릴스 탭으로 옮기는 안. 사용자가 "알림 먼저, IA는 별건"으로 정했고, 홈 피드 정체성은 "같은 게시물을 카드로"로 답했다. 그 경우 탐색 화면과 역할이 겹칠 위험을 제기했고 감수하기로 했다.

**이 단계의 상단 바는 오버레이인데, IA가 바뀌면 그 근거가 사라진다.** 오버레이를 택한 이유가 "홈이 전면 피드라 구조적 헤더를 넣으면 스냅 높이가 바뀐다"이기 때문이다. 홈이 게시글 피드가 되면 구조적 헤더가 맞는 답이 되므로 그때 다시 판단해야 한다.
