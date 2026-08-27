import { BottomNav } from "@/components/layout/bottom-nav";

/**
 * GNB가 붙는 셸. 데스크톱에서는 중앙 모바일 프레임을 유지한다.
 * 뷰어(/read)와 어드민(/admin)은 이 그룹 밖이라 GNB가 없다.
 *
 * 높이를 dvh로 고정하고 main에 min-h-0을 주는 이유: 피드가 자기 높이를
 * 정확히 알아야 스냅 스크롤이 성립한다. 각 화면이 h-full로 채우고
 * 필요하면 스스로 스크롤한다.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col">
      <main className="min-h-0 flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}
