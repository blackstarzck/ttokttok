import { createClient } from "@/lib/supabase/client";

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

/** 키셋 커서 — (created_at, id) 복합. */
export type CommentCursor = { createdAt: string; id: string };

export type CommentPage = { items: Comment[]; cursor: CommentCursor | null };

export const COMMENT_PAGE_SIZE = 20;
export const REPLY_PAGE_SIZE = 10;

// comment_likes가 comments와 profiles를 두 번째 경로로 잇는다
// (comment_likes_comment_id_fkey / comment_likes_user_id_fkey) — 그래서
// PostgREST 입장에서 comments -> profiles 관계가 comments_user_id_fkey와
// comment_likes를 통한 경로, 둘로 갈라진다. `profiles ( ... )`처럼 FK를
// 안 밝히면 PostgREST가 어느 쪽인지 못 골라 300 + PGRST201로 거부한다
// (실측). 그래서 반드시 `profiles!comments_user_id_fkey`로 못박는다.
// 조건은 "세 번째 테이블"이 아니라 "복합키 junction 테이블"이다 —
// reports도 comments와 profiles를 잇지만 PK가 자체 id(스칼라)라 별도
// 경로를 만들지 않는다. comment_id + user_id 두 FK로 된 복합 PK를 가진
// 테이블을 새로 추가할 때만 이 문제가 재발하니, 그때만 이 select의
// profiles 임베드에 FK 이름을 붙여야 한다.
const COMMENT_SELECT =
  "id, content, created_at, user_id, parent_id, like_count, profiles!comments_user_id_fkey ( nickname, avatar_url )";

/**
 * 페이지가 꽉 찼을 때만 다음 커서를 만든다 — 덜 찼으면 마지막 페이지다.
 * export하는 이유는 단위 테스트 대상이기 때문이다: 경계(size-1 / size)를
 * 잘못 잡으면 마지막 페이지에서 빈 요청이 무한히 나가거나, 반대로 남은
 * 댓글이 영영 안 나온다.
 */
export function toCursor(
  items: Comment[],
  size: number,
): CommentCursor | null {
  if (items.length < size) return null;
  const last = items[items.length - 1];
  return { createdAt: last.created_at, id: last.id };
}

export const REPORT_REASONS = [
  { value: "spam", label: "스팸·광고" },
  { value: "abuse", label: "욕설·비방" },
  { value: "etc", label: "기타" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];

/** 금칙어 트리거가 올리는 예외를 사람 말로 바꾼다. */
export function commentErrorMessage(message: string): string {
  if (message.includes("BANNED_WORD")) {
    return "사용할 수 없는 표현이 포함되어 있어요.";
  }
  if (message.includes("PARENT_DELETED")) {
    return "삭제된 댓글에는 답글을 달 수 없어요.";
  }
  if (message.includes("comments_content_check")) {
    return "댓글은 1자 이상 1000자 이하로 써 주세요.";
  }
  return "댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.";
}

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

  const rows = (data ?? []) as unknown as Omit<
    Comment,
    "reply_count" | "liked"
  >[];
  const withCounts = await withReplyCounts(db, rows);
  const items = await withLikeState(db, withCounts);
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
  rows: Omit<Comment, "reply_count" | "liked">[],
): Promise<Omit<Comment, "liked">[]> {
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

  const counts = countRepliesByParent(
    (data ?? []) as { parent_id: string | null }[],
  );
  return rows.map((r) => ({ ...r, reply_count: counts.get(r.id) ?? 0 }));
}

/**
 * parent_id 행들을 부모별 개수로 접는다. 네트워크에서 떼어낸 순수 함수라
 * 단위 테스트 대상이다 — 집계가 틀리면 "답글 N개 보기"의 N이 틀린다.
 */
export function countRepliesByParent(
  rows: { parent_id: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { parent_id } of rows) {
    if (parent_id === null) continue;
    counts.set(parent_id, (counts.get(parent_id) ?? 0) + 1);
  }
  return counts;
}

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

/** 한 댓글의 답글 한 페이지. 오래된 순 고정 (결정 4). */
export async function fetchReplyPage(
  parentId: string,
  cursor: CommentCursor | null,
): Promise<CommentPage> {
  const db = createClient();

  let q = db
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
  const withCounts = (
    (data ?? []) as unknown as Omit<Comment, "reply_count" | "liked">[]
  ).map((r) => ({ ...r, reply_count: 0 }));
  const items = await withLikeState(db, withCounts);
  return { items, cursor: toCursor(items, REPLY_PAGE_SIZE) };
}

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

  const targetBase = data as unknown as Omit<
    Comment,
    "reply_count" | "liked"
  >;

  // target 자체가 최상위면 root와 target이 같은 행이다 — 한 행을
  // withReplyCounts/withLikeState에 두 번 통과시키면(별도 호출이든
  // 배열에 중복으로 넣든) 좋아요 집계 쿼리의 in() 목록에 같은 id가
  // 겹쳐 들어갈 뿐 아니라 root와 target이 서로 다른 객체로 갈라져
  // "같은 댓글인데 두 사본이 다른 값"이라는, 이 함수를 만든 목적과
  // 정반대의 상태가 될 수 있다. 그래서 한 행만 계산해 양쪽에 같은
  // 참조를 돌려준다.
  if (!targetBase.parent_id) {
    const [withCount] = await withReplyCounts(db, [targetBase]);
    const [target] = await withLikeState(db, [withCount]);
    return { root: target, target };
  }

  const { data: parentRow } = await db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("id", targetBase.parent_id)
    .is("deleted_at", null)
    .maybeSingle();

  // target에 parent_id가 있는데 그 부모가 (소프트 삭제 등으로) 안 잡히면
  // null을 준다 — target 자신은 살아 있어도 고정 블록을 못 그린다.
  //
  // 오늘은 이 분기가 도달 불가능하다: flatten_comment_depth가 삭제된
  // 부모 아래 답글 생성 자체를 막고, cascade_comment_delete가 루트
  // 삭제 시 같은 트랜잭션에서 그 아래 살아 있는 답글을 전부 함께
  // 소프트 삭제하기 때문에 "부모는 죽었는데 자식은 살아 있는" 행이
  // 생기지 않는다. 두 트리거 중 하나라도 나중에 느슨해지면 이 분기가
  // 조용히 (에러 없이) target을 버리게 된다는 걸 기억해 둔다.
  if (!parentRow) return null;

  const parentBase = parentRow as unknown as Omit<
    Comment,
    "reply_count" | "liked"
  >;

  // root(최상위)만 실제 답글 수를 센다. target은 답글이라 자식을 가질 수
  // 없으므로(1단 고정, fetchReplyPage와 동일 규칙) reply_count는 항상 0 —
  // 굳이 withReplyCounts에 넣어 조회를 늘릴 이유가 없다.
  const [rootWithCount] = await withReplyCounts(db, [parentBase]);
  const targetWithCount: Omit<Comment, "liked"> = {
    ...targetBase,
    reply_count: 0,
  };

  // 좋아요 여부는 두 행을 한 번에 조회한다 — withLikeState는 이미
  // in() 배치를 지원하므로 root/target을 따로 부를 이유가 없다.
  const [root, target] = await withLikeState(db, [
    rootWithCount,
    targetWithCount,
  ]);

  return { root, target };
}

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

/** soft delete — 목록에서만 빠지고 행은 남는다 (PRD §5.5). */
export async function removeComment(commentId: string) {
  const { error } = await createClient()
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) throw new Error(error.message);
}

export async function reportComment(commentId: string, reason: ReportReason) {
  const { error } = await createClient()
    .from("reports")
    .insert({ comment_id: commentId, reason });
  if (error) {
    // 같은 댓글 중복 신고는 unique 제약에 걸린다 — 실패가 아니라 안내다.
    if (error.message.includes("duplicate") || error.code === "23505") {
      throw new Error("ALREADY_REPORTED");
    }
    throw new Error(error.message);
  }
}

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

/** "3분 전", "2일 전" — 목록에서 절대 시각은 과하다. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}
