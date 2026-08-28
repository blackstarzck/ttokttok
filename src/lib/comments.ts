import { createClient } from "@/lib/supabase/client";

export type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { nickname: string; avatar_url: string | null } | null;
};

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
  if (message.includes("comments_content_check")) {
    return "댓글은 1자 이상 1000자 이하로 써 주세요.";
  }
  return "댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await createClient()
    .from("comments")
    .select("id, content, created_at, user_id, profiles ( nickname, avatar_url )")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Comment[];
}

export async function addComment(postId: string, content: string) {
  // user_id는 DB 기본값(auth.uid())이 채운다.
  const { error } = await createClient()
    .from("comments")
    .insert({ post_id: postId, content });
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
