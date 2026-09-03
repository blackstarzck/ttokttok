import { createClient } from "@/lib/supabase/server";
import type { FeedBook } from "@/lib/feed";

/**
 * 활동 탭이 쓰는 최소 도서 필드.
 *
 * `BookCover`가 실제로 읽는 필드(`cover_url`·`title`·`author`)만 고른다 —
 * `ActivityTab`은 클라이언트 컴포넌트라 여기서 고른 필드가 프로필을 열
 * 때마다(활동 탭을 안 열어도) RSC 플라이트 페이로드에 그대로 실린다.
 * `intro`처럼 길이가 없는 `text` 컬럼을 최대 50건 얹으면 그 비용이
 * 조용히 커진다.
 */
const BOOK_FIELDS = `cover_url, title, author`;

/** 목록 상한. 개인 활동 목록이라 페이지네이션 없이 최근 것만 보여준다. */
const ACTIVITY_LIMIT = 50;

/** 활동 탭 좋아요 그리드가 쓰는 도서 필드 — `BOOK_FIELDS`와 짝을 이룬다. */
type LikedPostBook = Pick<FeedBook, "cover_url" | "title" | "author">;

export type LikedPost = { postId: string; book: LikedPostBook };

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
  return (
    rows as { posts?: { id: string; books?: LikedPostBook | null } | null }[]
  )
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
 *
 * 다만 `auth.ts`의 `getLikedPostIds`는 같은 `likes` 표를 조회하면서도
 * `user_id`를 명시한다 — 그건 RLS가 이미 좁혀준 위에 의도를 드러내려는
 * 군더더기 조건이지, 여기서 생략하는 것과 모순되지 않는다. 표는 같아도
 * "생략해도 되는 조건을 굳이 쓴 경우"와 "생략하면 틀린 결과가 나오는
 * 경우"(`getMyComments` 참고)는 다른 이야기다.
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
