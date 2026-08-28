import { createClient } from "@/lib/supabase/client";
import { getSessionId } from "@/lib/session-id";

/**
 * 분석 이벤트 (PRD §7).
 *
 * 두 깔때기를 같은 표에서 센다 (결정 기록 §11-32):
 *   전문 도서  post_view → reader_open → reader_progress → book_complete
 *   링크형     post_view → book_sheet_open → purchase_link_click
 *
 * `post_view`는 record_view RPC가 함께 남기므로 여기서 부르지 않는다.
 */
export type AnalyticsEvent =
  | "reader_open"
  | "reader_progress"
  | "book_complete"
  | "like"
  | "comment"
  | "share"
  | "book_sheet_open"
  | "purchase_link_click";

type Payload = {
  postId?: string | null;
  bookId?: string | null;
  props?: Record<string, unknown>;
};

/**
 * 실패해도 조용히 넘어간다 — 분석 때문에 사용자 동작이 막히면 안 된다.
 * 호출부에서 await할 필요가 없도록 항상 성공으로 끝난다.
 */
export async function track(
  event: AnalyticsEvent,
  { postId = null, bookId = null, props = {} }: Payload = {},
): Promise<void> {
  try {
    const { error } = await createClient().rpc("track_event", {
      p_event: event,
      p_session_id: getSessionId(),
      p_post_id: postId,
      p_book_id: bookId,
      p_props: props,
    });
    if (error) console.error(`track(${event}):`, error.message);
  } catch (err) {
    console.error(`track(${event}):`, err);
  }
}
