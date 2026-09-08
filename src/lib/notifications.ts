import { createClient } from "@/lib/supabase/server";
import { NOTIFICATION_PAGE_SIZE } from "@/lib/notifications-client";

// 한 페이지 크기(NOTIFICATION_PAGE_SIZE). 값 자체는 notifications-client.ts에
// 있다 — 이 파일은 서버 전용(next/headers)이라 클라이언트 컴포넌트가 상수
// 하나를 가져오려 해도 서버 코드가 클라이언트 번들에 딸려 들어간다.

/**
 * 페이지 경계 (키셋).
 *
 * `createdAt`은 **DB가 준 문자열 그대로**여야 한다. `new Date(...)`를
 * 거치면 Postgres의 마이크로초가 밀리초로 깎여, 같은 마이크로초에 만들어진
 * 알림이 경계에서 건너뛰어지거나 두 번 나온다. URL에 실을 때는 반드시
 * `encodeURIComponent`로 감싼다 — 타임스탬프의 `+09:00`에서 `+`가 쿼리
 * 문자열에서는 공백으로 디코드되어 파싱이 깨진다.
 */
export type NotificationCursor = { createdAt: string; id: string };

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
export async function getNotifications(cursor?: NotificationCursor): Promise<{
  groups: NotificationGroup[];
  /** 다음(더 오래된) 페이지의 시작점. null이면 끝이다. */
  nextCursor: NotificationCursor | null;
  /** 안 읽은 알림 **전체** 수 — 이 페이지 안이 아니다. */
  unreadCount: number;
  failed: boolean;
}> {
  const db = await createClient();

  let query = db
    .from("notifications")
    .select(
      "id, type, comment_id, post_id, read_at, created_at, " +
        "actor:profiles!notifications_actor_id_fkey ( nickname ), " +
        "comments ( content )",
    )
    .order("created_at", { ascending: false })
    // created_at만으로는 같은 밀리초에 만들어진 두 알림의 순서가 불특정이라
    // 커서가 그 경계에서 행을 건너뛰거나 겹칠 수 있다. 좋아요는 트리거가
    // 만들고 한 댓글에 여러 개가 동시에 들어올 수 있어 실제로 가능하다.
    .order("id", { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE);

  if (cursor) {
    // 키셋: (created_at, id)가 커서보다 **엄격히 작은** 것들.
    query = query.or(
      `created_at.lt.${cursor.createdAt},` +
        `and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    query,
    // 배지와 같은 수를 화면에서도 쓴다. head:true라 본문을 받지 않는다.
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  if (error || countError) {
    console.error("getNotifications:", (error ?? countError)?.message);
    // activity.ts는 실패 시 []를 돌려주지만 여기서는 실패를 구분해 넘긴다.
    // 알림함에서 []는 "알림 없음"으로 렌더되는데, 사용자는 방금 배지에
    // 숫자가 떠 있는 것을 보고 들어왔다 — 빈 목록을 보여주면 앱이 거짓말을
    // 한 것이 되고, 무엇을 못 봤는지 알 방법이 사라진다. 2단계에서 어드민
    // 신고 목록이 300 에러를 삼켜 빈 큐로 보였던 것과 같은 모양이다.
    return { groups: [], nextCursor: null, unreadCount: 0, failed: true };
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

  // 커서는 **마지막 행**에서 뽑는다 — 마지막 묶음이 아니다. 좋아요가 묶이면
  // 묶음 수가 행 수보다 적어서, 묶음에서 뽑으면 그 사이 행들을 통째로
  // 건너뛴다. created_at은 DB가 준 문자열을 그대로 들고 다닌다(Date로
  // 파싱했다 다시 만들면 마이크로초가 밀리초로 깎여 경계에서 어긋난다 —
  // 피드 커서가 점수를 문자열로 주고받는 것과 같은 이유, §11-37).
  const last = rows.at(-1);
  const nextCursor =
    rows.length < NOTIFICATION_PAGE_SIZE || !last
      ? null
      : { createdAt: last.createdAt, id: last.id };

  return {
    groups: groupNotifications(rows),
    nextCursor,
    unreadCount: count ?? 0,
    failed: false,
  };
}
