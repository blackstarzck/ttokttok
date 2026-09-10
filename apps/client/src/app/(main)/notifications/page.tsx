import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationRow } from "@/components/notifications/notification-row";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";

export const metadata: Metadata = { title: "알림" };

const one = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

/**
 * 알림함 (PRD §5.5).
 *
 * 페이지네이션을 **URL 상태**로 둔다(FRONTEND.md §4). 알림을 탭하면 곧바로
 * 그 댓글로 이동하므로(§11-47 딥링크) 목록을 화면에 이어 붙여 둘 이유가
 * 없고, 오히려 URL에 있으면 뒤로가기가 보던 페이지로 정확히 돌아온다.
 * 무한 목록이면 돌아왔을 때 1페이지로 리셋된다.
 */
export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const user = await getCurrentUser();
  // 알림은 본인 것뿐이라 게스트에게 보여줄 내용이 없다.
  if (!user) redirect("/login?next=/notifications");

  const sp = await searchParams;
  const before = one(sp.before);
  const beforeId = one(sp.beforeId);
  // 둘 다 있어야 커서다 — 한쪽만 온 주소는 무시하고 첫 페이지를 준다.
  const cursor = before && beforeId ? { createdAt: before, id: beforeId } : undefined;

  const { groups, nextCursor, unreadCount, failed } =
    await getNotifications(cursor);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold break-keep">알림</h1>
        <MarkAllReadButton unreadCount={unreadCount} />
      </header>

      {groups.length ? (
        <>
          {/* gap-2 = 8px. DESIGN.md:155가 44×44 터치 타깃과 함께 인접 타깃 간
              8px 이상을 규정한다 — gap-1(4px)로는 이 줄을 못 지킨다. */}
          <ul className="flex flex-col gap-2">
            {groups.map((g) => (
              <NotificationRow key={g.key} group={g} />
            ))}
          </ul>

          {nextCursor ? (
            // 커서를 그대로 URL에 싣는다. encodeURIComponent가 반드시
            // 필요하다 — 타임스탬프의 `+09:00`에서 `+`가 쿼리 문자열에서는
            // 공백으로 디코드되어 다음 페이지가 통째로 깨진다.
            <Link
              href={`/notifications?before=${encodeURIComponent(nextCursor.createdAt)}&beforeId=${nextCursor.id}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mx-auto flex min-h-11 items-center rounded-md px-4 text-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              이전 알림 더 보기
            </Link>
          ) : null}
        </>
      ) : (
        // 실패와 빈 목록을 다른 문구로 말한다 — 같은 화면을 보여주면
        // 사용자가 "알림이 없다"고 잘못 믿는다.
        <p className="text-muted-foreground py-10 text-center text-sm break-keep">
          {failed
            ? "알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            : cursor
              ? "더 오래된 알림이 없어요."
              : "아직 알림이 없어요."}
        </p>
      )}

      {cursor ? (
        <Link
          href="/notifications"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mx-auto flex min-h-11 items-center rounded-md px-4 text-sm underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          최신 알림으로
        </Link>
      ) : null}
    </div>
  );
}
