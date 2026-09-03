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
export async function getNotifications(): Promise<{
  groups: NotificationGroup[];
  failed: boolean;
}> {
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
    // activity.ts는 실패 시 []를 돌려주지만 여기서는 실패를 구분해 넘긴다.
    // 알림함에서 []는 "알림 없음"으로 렌더되는데, 사용자는 방금 배지에
    // 숫자가 떠 있는 것을 보고 들어왔다 — 빈 목록을 보여주면 앱이 거짓말을
    // 한 것이 되고, 무엇을 못 봤는지 알 방법이 사라진다. 2단계에서 어드민
    // 신고 목록이 300 에러를 삼켜 빈 큐로 보였던 것과 같은 모양이다.
    return { groups: [], failed: true };
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

  return { groups: groupNotifications(rows), failed: false };
}
