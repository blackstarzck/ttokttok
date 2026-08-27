import { BottomNav } from "@/components/layout/bottom-nav";

/**
 * GNB가 붙는 셸. 데스크톱에서는 중앙 모바일 프레임을 유지한다.
 * 뷰어(/read)와 어드민(/admin)은 이 그룹 밖이라 GNB가 없다.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <main className="flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}
