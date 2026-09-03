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

  const { groups, failed } = await getNotifications();

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <h1 className="text-lg font-bold break-keep">알림</h1>

      {groups.length ? (
        // gap-2 = 8px. DESIGN.md:155가 44×44 터치 타깃과 함께 인접 타깃 간
        // 8px 이상을 규정한다 — gap-1(4px)로는 이 줄을 못 지킨다.
        <ul className="flex flex-col gap-2">
          {groups.map((g) => (
            <NotificationRow key={g.key} group={g} />
          ))}
        </ul>
      ) : (
        // 실패와 빈 목록을 다른 문구로 말한다 — 같은 화면을 보여주면
        // 사용자가 "알림이 없다"고 잘못 믿는다.
        <p className="text-muted-foreground py-10 text-center text-sm">
          {failed
            ? "알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            : "아직 알림이 없어요."}
        </p>
      )}
    </div>
  );
}
