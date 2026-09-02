import { createClient } from "@/lib/supabase/client";

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
