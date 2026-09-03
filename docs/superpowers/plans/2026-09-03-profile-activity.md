# 프로필 활동 탭 (3단계) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로필에 활동 탭을 더해 내가 좋아요한 게시물과 내가 쓴 댓글을 모아 본다.

**Architecture:** 데이터는 서버 컴포넌트가 가져오고(기존 `lib/library.ts` 관례 그대로), 세그먼트 토글만 클라이언트 컴포넌트로 분리한다. 좋아요는 `likes_select_own` 덕에 조건 없이 내 것만 오지만, **댓글은 다르다** — `comments`는 공개 읽기 표라 `comments_select_visible`가 "삭제 안 됐거나 내 것"을 주므로, 한 정책의 두 절이 각각 `user_id`와 `deleted_at` 조건을 요구한다. 둘 중 하나만 걸면 조용히 틀린 목록이 나온다.

**Tech Stack:** Next.js 16.3.3 App Router (서버 컴포넌트) / React 19 / Supabase + PostgREST / Vitest / Tailwind v4 / shadcn-ui

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-09-02-comment-threads-design.md` — **결정 18**(활동 탭 추가, 세그먼트 토글 2개, 좋아요는 도서 커버 3열 그리드·댓글은 텍스트 목록).
- **서버 컴포넌트가 기본값** (`docs/FRONTEND.md` §2). `"use client"`는 상태가 필요한 최소 단위(세그먼트 토글)에만 붙인다. 페이지 전체를 클라이언트로 만들지 않는다.
- 서버 코드는 `@/lib/supabase/server`, 클라이언트는 `@/lib/supabase/client`. **혼용 금지** (`docs/FRONTEND.md` §5).
- **보안은 RLS가 담당한다.** 정책이 이미 본인 행으로 좁혀주는 표(`likes`·`bookmarks`·`reading_progress`)에서는 `user_id`로 다시 거르지 않는다 — 규칙이 두 곳에 생긴다. **예외는 `comments` 하나다**: 공개 읽기 표라 정책이 내 행으로 좁혀주지 않으므로 `user_id`를 명시해야 한다. 이건 보안을 프론트에서 흉내 내는 게 아니라 "내 것만 보는 목록"이라는 **화면의 요구**다.
- 스타일은 **시맨틱 토큰만**. 원시 hex·px·Tailwind 팔레트 직접 참조 금지.
- 터치 타깃 44×44px 이상, **인접 타깃 간 8px 이상** (`docs/DESIGN.md:155` — 한 줄에 두 가지를 규정한다).
- 로딩은 스피너가 아니라 **Skeleton**, 피드백은 Sonner 토스트 (`docs/DESIGN.md` Components).
- 한국어 제목류에는 `break-keep`. 본문 14px·캡션 12px 미만 금지.
- **테스트는 순수 함수만.** Supabase 쿼리 빌더를 모킹하지 않는다 (`docs/FRONTEND.md` §7).
- 한국어 주석으로 **왜**를 적는다. 커밋 메시지는 한국어 + Conventional Commits.

---

## File Structure

| 파일 | 책임 | 변경 | 태스크 |
|---|---|---|---|
| `src/lib/activity.ts` | 활동 탭 데이터 조회 + 순수 정리 함수 | 생성 | 1 |
| `src/lib/activity.test.ts` | 순수 함수 단위 테스트 | 생성 | 1 |
| `src/components/profile/activity-tab.tsx` | 세그먼트 토글 + 두 목록 렌더 (클라이언트) | 생성 | 2 |
| `src/app/(main)/profile/page.tsx` | 활동 탭을 4번째 탭으로 편입 | 수정 | 2 |
| `docs/prd-ttokttok.md` | §5.7 탭 구성, §11 결정 기록 | 수정 | 3 |

`lib/library.ts`에 넣지 않고 `lib/activity.ts`를 새로 만드는 이유: `library.ts`는 **서재**(진행률·보관함, 전부 도서 단위)를 담당한다. 활동은 게시물·댓글 단위라 조회 대상도 반환 형태도 다르다. 한 파일에 넣으면 "도서를 돌려주는 함수"와 "게시물을 돌려주는 함수"가 섞여 다음 사람이 어느 쪽을 쓸지 매번 읽어야 한다.

`components/profile/`을 새로 만드는 이유: `FRONTEND.md` §1이 화면 전용 조각을 도메인 폴더에 두라고 정한다. 프로필 도메인 폴더가 아직 없으니 여기서 생긴다.

---

## Task 1: 데이터 계층

**Files:**
- Create: `src/lib/activity.ts`
- Create: `src/lib/activity.test.ts`

**Interfaces:**
- Produces:
  - `type LikedPost = { postId: string; book: FeedBook }`
  - `type MyComment = { id: string; content: string; createdAt: string; postId: string; bookTitle: string }`
  - `flattenLikedPosts(rows: unknown[]): LikedPost[]`
  - `flattenMyComments(rows: unknown[]): MyComment[]`
  - `getLikedPosts(): Promise<LikedPost[]>` — 인자 없음 (RLS가 좁혀준다)
  - `getMyComments(userId: string): Promise<MyComment[]>` — **인자 필요** (RLS가 안 좁혀준다)

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다 (RED)**

`src/lib/activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { flattenLikedPosts, flattenMyComments } from "@/lib/activity";

describe("flattenLikedPosts", () => {
  it("게시물과 도서가 있는 행만 남긴다", () => {
    const out = flattenLikedPosts([
      { posts: { id: "p1", books: { id: "b1", title: "책1" } } },
      { posts: { id: "p2", books: { id: "b2", title: "책2" } } },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      postId: "p1",
      book: { id: "b1", title: "책1" },
    });
  });

  it("게시물이 null인 행을 버린다 — 미발행이면 RLS가 null로 준다", () => {
    const out = flattenLikedPosts([
      { posts: null },
      { posts: { id: "p1", books: { id: "b1", title: "책1" } } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].postId).toBe("p1");
  });

  it("도서가 null인 행도 버린다 — 커버를 그릴 수 없다", () => {
    expect(flattenLikedPosts([{ posts: { id: "p1", books: null } }])).toEqual(
      [],
    );
  });

  it("빈 입력은 빈 배열", () => {
    expect(flattenLikedPosts([])).toEqual([]);
  });

  it("같은 도서의 게시물이 여럿이면 둘 다 남긴다 — 게시물 단위 목록이다", () => {
    const out = flattenLikedPosts([
      { posts: { id: "p1", books: { id: "b1", title: "책1" } } },
      { posts: { id: "p2", books: { id: "b1", title: "책1" } } },
    ]);
    expect(out.map((l) => l.postId)).toEqual(["p1", "p2"]);
  });
});

describe("flattenMyComments", () => {
  it("게시물·도서가 있는 행을 평평하게 만든다", () => {
    const out = flattenMyComments([
      {
        id: "c1",
        content: "좋네요",
        created_at: "2026-09-03T00:00:00Z",
        posts: { id: "p1", books: { title: "책1" } },
      },
    ]);
    expect(out).toEqual([
      {
        id: "c1",
        content: "좋네요",
        createdAt: "2026-09-03T00:00:00Z",
        postId: "p1",
        bookTitle: "책1",
      },
    ]);
  });

  it("게시물이 null인 행을 버린다 — 갈 곳이 없는 댓글이다", () => {
    expect(
      flattenMyComments([
        { id: "c1", content: "x", created_at: "t", posts: null },
      ]),
    ).toEqual([]);
  });

  it("도서 제목이 없으면 빈 문자열로 채운다 — 목록이 깨지지 않게", () => {
    const out = flattenMyComments([
      {
        id: "c1",
        content: "x",
        created_at: "t",
        posts: { id: "p1", books: null },
      },
    ]);
    expect(out[0].bookTitle).toBe("");
    expect(out[0].postId).toBe("p1");
  });

  it("빈 입력은 빈 배열", () => {
    expect(flattenMyComments([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다 (RED)**

```bash
npx vitest run src/lib/activity.test.ts
```

기대: `Failed to resolve import "@/lib/activity"` — 모듈이 아직 없다.

- [ ] **Step 3: `activity.ts`를 구현한다 (GREEN)**

```ts
import { createClient } from "@/lib/supabase/server";
import type { FeedBook } from "@/lib/feed";

/** 활동 탭이 쓰는 최소 도서 필드. 그리드는 커버와 제목만 그린다. */
const BOOK_FIELDS = `
  id, title, author, translator, publisher, cover_url, category, isbn,
  page_count, pub_date_paper, pub_date_ebook, intro, toc,
  epub_path, purchase_links
`;

/** 목록 상한. 개인 활동 목록이라 페이지네이션 없이 최근 것만 보여준다. */
const ACTIVITY_LIMIT = 50;

export type LikedPost = { postId: string; book: FeedBook };

export type MyComment = {
  id: string;
  content: string;
  createdAt: string;
  postId: string;
  bookTitle: string;
};

/**
 * 좋아요 조회 결과를 평평하게 만든다.
 *
 * 게시물이 null인 행을 버리는 이유: posts_select_published가 미발행
 * 게시물을 RLS 단계에서 잘라 조인 결과를 null로 만든다. 그대로 그리면
 * 눌러도 404가 나는 죽은 카드가 된다.
 *
 * 같은 도서의 게시물이 여럿이면 둘 다 남긴다 — 이건 도서 목록이 아니라
 * 게시물 목록이고, 한 도서에 게시물이 여럿인 것은 설계된 상태다(§11-36).
 */
export function flattenLikedPosts(rows: unknown[]): LikedPost[] {
  return (rows as { posts?: { id: string; books?: FeedBook | null } | null }[])
    .map((r) =>
      r.posts && r.posts.books
        ? { postId: r.posts.id, book: r.posts.books }
        : null,
    )
    .filter((v): v is LikedPost => v !== null);
}

/**
 * 내 댓글 조회 결과를 평평하게 만든다.
 *
 * 게시물이 null이면 버린다 — 탭했을 때 갈 곳이 없다.
 * 도서 제목은 없으면 빈 문자열로 둔다: 제목은 맥락 표시일 뿐이라
 * 없다고 댓글 자체를 감출 이유가 없다.
 */
export function flattenMyComments(rows: unknown[]): MyComment[] {
  return (
    rows as {
      id: string;
      content: string;
      created_at: string;
      posts?: { id: string; books?: { title?: string } | null } | null;
    }[]
  )
    .map((r) =>
      r.posts
        ? {
            id: r.id,
            content: r.content,
            createdAt: r.created_at,
            postId: r.posts.id,
            bookTitle: r.posts.books?.title ?? "",
          }
        : null,
    )
    .filter((v): v is MyComment => v !== null);
}

/**
 * 내가 좋아요한 게시물 (설계 결정 18).
 *
 * RLS(likes_select_own)가 본인 행만 주므로 user_id 조건을 쓰지 않는다 —
 * 프론트에서 다시 거르면 규칙이 두 곳에 생긴다(FRONTEND.md §5).
 */
export async function getLikedPosts(): Promise<LikedPost[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("likes")
    .select(`posts ( id, books ( ${BOOK_FIELDS} ) )`)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    console.error("getLikedPosts:", error.message);
    return [];
  }
  return flattenLikedPosts(data ?? []);
}

/**
 * 내가 쓴 댓글·답글 (설계 결정 18).
 *
 * **이 파일에서 유일하게 `user_id`를 명시하는 조회다.** `likes`는
 * `likes_select_own`이 본인 행만 주지만, `comments`는 공개 읽기 표라
 * `comments_select_visible`가 "삭제 안 됐거나 내 것"을 준다 — RLS가
 * 내 행으로 좁혀주지 않으므로 조건을 걸지 않으면 남의 댓글까지 온다.
 *
 * `deleted_at`도 함께 거는 이유는 같은 정책의 나머지 절반 때문이다:
 * "내 것"이면 삭제된 것도 돌려주므로, 안 걸면 내가 지운 댓글과 부모가
 * 지워져 연쇄로 숨겨진 답글(§11-43)이 활동 탭에 되살아난다.
 *
 * 즉 이 한 정책의 두 절이 각각 다른 조건을 요구한다. 둘 중 하나만
 * 걸면 조용히 틀린 목록이 나온다.
 */
export async function getMyComments(userId: string): Promise<MyComment[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("comments")
    .select("id, content, created_at, posts ( id, books ( title ) )")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) {
    console.error("getMyComments:", error.message);
    return [];
  }
  return flattenMyComments(data ?? []);
}
```

> `console.error` + 빈 배열로 처리하는 이유: `lib/library.ts`의 기존 두 함수가 같은 방식이다. 프로필의 한 탭이 실패해도 나머지 탭은 보여야 한다 — 화면 전체를 던져 날리지 않는다.
>
> 어드민 신고 큐와 반대로 하는 이유(2단계에서 그쪽은 `throw`로 바꿨다): 그쪽은 **빈 목록과 실패가 구별되지 않으면 모더레이션이 방치**되지만, 여기서는 빈 활동 탭이 "아직 아무것도 안 했다"는 정상 상태이고 다른 탭은 멀쩡히 쓸 수 있다.

- [ ] **Step 4: 통과를 확인한다 (GREEN)**

```bash
npx vitest run
```

기대: `45 passed` (기존 36 + 이번 9). 출력에 잡음이 없어야 한다.

- [ ] **Step 5: 빌드**

```bash
npm run build
```

기대: 성공. 타입 오류 0건.

- [ ] **Step 6: 실제 DB로 두 쿼리를 확인**

로컬 스택이 떠 있다. 시드(`npm run seed`)와 Auth 관리자 API로 만든 사용자로 좋아요·댓글을 몇 개 만든 뒤, **삭제한 댓글이 안 나오는지**와 **남의 댓글이 안 나오는지**를 확인한다. `set local role authenticated` + `request.jwt.claims`로 신원을 잡고 `begin; … rollback;`으로 감싼다.

기대: 내 살아 있는 댓글만 나온다. 내가 지운 댓글, 부모가 지워져 함께 숨겨진 답글, 남의 댓글은 모두 빠진다.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/activity.ts src/lib/activity.test.ts
git commit -m "feat(profile): 활동 탭 데이터 계층 — 좋아요한 게시물·내 댓글"
```

---

## Task 2: 활동 탭 UI

**Files:**
- Create: `src/components/profile/activity-tab.tsx`
- Modify: `src/app/(main)/profile/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `getLikedPosts`, `getMyComments`, `LikedPost`, `MyComment`
- Produces: `ActivityTab` — props `{ likedPosts: LikedPost[]; comments: MyComment[] }`

- [ ] **Step 1: `activity-tab.tsx` 생성**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { BookCover } from "@/components/feed/book-cover";
import { timeAgo } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { LikedPost, MyComment } from "@/lib/activity";

/**
 * 프로필 활동 탭 (설계 결정 18).
 *
 * 데이터는 서버 컴포넌트가 가져오고 여기서는 어느 쪽을 보여줄지만 고른다 —
 * 상태가 필요한 최소 단위만 클라이언트다 (FRONTEND.md §2).
 *
 * 좋아요한 게시물을 탭하면 도서 시트가 아니라 **게시물로** 간다. 좋아요는
 * 게시물에 한 것이라, 도서로 보내면 무엇을 좋아요했는지가 사라지고 보관함과
 * 구별되지 않는다.
 */
export function ActivityTab({
  likedPosts,
  comments,
}: {
  likedPosts: LikedPost[];
  comments: MyComment[];
}) {
  const [tab, setTab] = useState<"likes" | "comments">("likes");

  return (
    <div className="flex flex-col gap-4">
      {/* gap-2 = 8px. DESIGN.md는 44×44와 함께 인접 타깃 간 8px을 규정한다. */}
      <div className="flex gap-2">
        {(
          [
            ["likes", `좋아요 ${likedPosts.length}`],
            ["comments", `내 댓글 ${comments.length}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "focus-visible:ring-ring min-h-11 flex-1 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              tab === key
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "likes" ? (
        likedPosts.length ? (
          <ul className="grid grid-cols-3 gap-3">
            {likedPosts.map(({ postId, book }) => (
              <li key={postId}>
                <Link
                  href={`/p/${postId}`}
                  className="focus-visible:ring-ring flex flex-col gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <BookCover book={book} className="w-full" />
                  <span className="line-clamp-2 text-xs leading-snug break-keep">
                    {book.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            아직 좋아요한 게시물이 없어요.
          </p>
        )
      ) : comments.length ? (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <Link
                href={`/p/${c.postId}`}
                className="hover:bg-accent focus-visible:ring-ring flex min-h-11 flex-col gap-1 rounded-lg p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="truncate break-keep">{c.bookTitle}</span>
                  <span className="shrink-0">{timeAgo(c.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-sm leading-relaxed break-keep">
                  {c.content}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">
          아직 쓴 댓글이 없어요.
        </p>
      )}
    </div>
  );
}
```

> 세그먼트 토글에 `aria-pressed`를 쓰고 라벨은 상태와 무관하게 고정한다 — 2단계에서 하트가 같은 실수(라벨이 상태에 따라 바뀌어 스크린리더가 "좋아요 취소, 눌림"으로 읽음)를 했다가 고쳤다.

- [ ] **Step 2: 프로필 페이지에 4번째 탭으로 편입**

`src/app/(main)/profile/page.tsx`에서:

import를 더한다:

```ts
import { ActivityTab } from "@/components/profile/activity-tab";
import { getLikedPosts, getMyComments } from "@/lib/activity";
```

데이터 로드에 두 호출을 더한다. 기존 `Promise.all`에 합쳐 왕복을 늘리지 않는다:

```ts
  const [{ reading, finished }, bookmarks, likedPosts, myComments] =
    await Promise.all([
      getReadingProgress(),
      getBookmarks(),
      getLikedPosts(),
      getMyComments(user.id),
    ]);
```

`TabsList`에 트리거를 더한다 (4개가 된다):

```tsx
          <TabsTrigger value="activity" className="flex-1">
            활동
          </TabsTrigger>
```

`TabsContent`를 더한다:

```tsx
        <TabsContent value="activity">
          <ActivityTab likedPosts={likedPosts} comments={myComments} />
        </TabsContent>
```

- [ ] **Step 3: 테스트와 빌드**

```bash
npx vitest run && npm run build
```

기대: `45 passed`, 빌드 성공, 타입 오류 0건.

- [ ] **Step 4: 375px에서 실제 렌더 확인**

로컬 스택과 개발 서버로 확인한다. 테스트 계정으로 좋아요 2~3개와 댓글 2~3개(그중 하나는 답글, 하나는 삭제한 것)를 만들어 둔 뒤:

1. 프로필 탭이 4개(`학습 중 / 보관함 / 완독 / 활동`)이고 375px에서 라벨이 잘리지 않는다
2. 활동 탭을 열면 기본이 `좋아요`이고 개수가 라벨에 보인다
3. 좋아요 그리드가 3열이고 커버와 제목이 보인다
4. 커버를 탭하면 **게시물**(`/p/[postId]`)로 간다 — 도서 시트가 아니다
5. `내 댓글`로 전환하면 내가 쓴 댓글이 최신순으로 보이고, 도서 제목과 상대 시각이 함께 보인다
6. **내가 삭제한 댓글은 보이지 않는다**
7. **남이 쓴 댓글은 보이지 않는다**
8. 댓글을 탭하면 해당 게시물로 간다
9. 세그먼트 버튼의 터치 타깃이 44px 이상이고 둘 사이 간격이 8px 이상이다
10. 좋아요·댓글이 하나도 없을 때 각각의 빈 상태 문구가 뜬다

- [ ] **Step 5: 커밋**

```bash
git add src/components/profile/activity-tab.tsx "src/app/(main)/profile/page.tsx"
git commit -m "feat(profile): 활동 탭 — 좋아요한 게시물·내 댓글

좋아요한 게시물을 탭하면 도서 시트가 아니라 게시물로 보낸다. 좋아요는
게시물에 한 것이라 도서로 보내면 무엇을 좋아요했는지가 사라지고 보관함과
구별되지 않는다."
```

---

## Task 3: 문서 갱신

**Files:**
- Modify: `docs/prd-ttokttok.md` — §5.7 탭 구성, §11 결정 기록

**Interfaces:**
- Consumes: Task 1~2에서 확정된 동작

- [ ] **Step 1: §5.7의 탭 구성을 갱신**

§5.7은 지금 탭 3개(`학습 중`/`보관함`/`완독`)를 나열하고 제목이 "프로필 (/profile) — 기록형만"이다. 활동 탭을 더하고, 제목의 "기록형만"이 더 이상 정확하지 않으므로 함께 손본다. 탭 목록에 추가할 항목:

```markdown
  - **활동**: 세그먼트 토글 2개 — 좋아요한 게시물(도서 커버 3열 그리드, 탭 시 해당 **게시물**로 이동)과 내가 쓴 댓글·답글(최신순 목록, 탭 시 해당 게시물로 이동). 각 50개까지.
```

`제외(v2)` 줄은 그대로 둔다 — 포인트·레벨·스트릭은 여전히 안 만든다.

- [ ] **Step 2: §11 결정 기록에 행을 추가**

표의 마지막 행 번호를 먼저 확인하고(2단계에서 45가 추가됐다) 그 다음 번호로 붙인다:

```markdown
| 46 | 프로필 활동 탭 | 좋아요한 게시물과 내가 쓴 댓글을 프로필 4번째 탭에 모은다. 좋아요 목록을 **도서 커버 그리드**로 그리면서도 탭하면 도서 시트가 아니라 **게시물**로 보낸다 — 좋아요는 게시물에 한 것이라 도서로 보내면 무엇을 좋아요했는지가 사라지고 보관함과 구별되지 않는다. **알려진 한계**: 그래도 시각적으로는 보관함과 비슷하고, 한 도서에 게시물이 여럿이면(§11-36) 같은 커버가 반복된다 — 좋아요(가벼운 반응)와 찜(나중에 읽을 것)의 역할이 흐려질 수 있다는 지적을 알고도 택했다. 내 댓글 조회는 이 저장소에서 **유일하게 `user_id`를 명시하는 목록**이다: `comments`는 공개 읽기 표라 `comments_select_visible`가 "삭제 안 됐거나 내 것"을 주므로 RLS만으로는 내 행으로 좁혀지지 않는다. `deleted_at`도 함께 걸어야 내가 지운 댓글과 부모가 지워져 연쇄로 숨겨진 답글(§11-43)이 되살아나지 않는다 |
```

- [ ] **Step 3: 문서와 코드가 어긋나지 않는지 확인**

```bash
grep -n "활동" docs/prd-ttokttok.md
```

기대: §5.7과 §11에 나온다.

- [ ] **Step 4: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 프로필 활동 탭 명세와 결정 기록 반영"
```

---

## 3단계 완료 기준

- [ ] `npx vitest run` — 45 passed, 출력에 잡음 없음
- [ ] `npm run build` 통과
- [ ] Task 1 Step 7의 DB 확인 통과 (삭제한 댓글·남의 댓글이 안 나온다)
- [ ] Task 2 Step 4의 렌더 검증 10항목 통과
- [ ] PRD §5.7·§11이 실제 동작과 일치

## 이 단계에서 하지 않는 것

- **페이지네이션.** 개인 활동 목록이라 최근 50개로 자른다. 넘치면 그때 키셋을 붙인다(1단계에 선례가 있다).
- **알림.** 4단계의 몫이다. 활동 탭은 "내가 한 일"이고 알림은 "남이 나에게 한 일"이라 서로 대체되지 않는다.
- **좋아요 취소를 활동 탭에서 하기.** 목록은 읽기 전용이다 — 토글을 여기 두면 목록이 자기 발밑에서 바뀐다.
