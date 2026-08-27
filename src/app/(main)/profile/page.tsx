import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export const metadata: Metadata = { title: "프로필" };

export default function ProfilePage() {
  return (
    <PlaceholderScreen
      title="프로필"
      phase="Phase 2"
      description="기록형 프로필. 포인트·레벨·성좌 없이 읽은 것만 남긴다."
      todo={[
        "로그인 유도 (비로그인 접근 시)",
        "학습 중 — 진행률 있는 도서",
        "보관함 — 찜한 도서",
        "완독 — 다 읽은 도서",
      ]}
    />
  );
}
