import { TopBarView } from "@ttokttok/ui/feed/top-bar-view";
import { UnreadBadge } from "@/components/feed/unread-badge";

export function TopBar({ isGuest }: { isGuest: boolean }) {
  return (
    <TopBarView isGuest={isGuest} badge={isGuest ? null : <UnreadBadge />} />
  );
}
