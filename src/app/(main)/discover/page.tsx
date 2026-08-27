import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export const metadata: Metadata = { title: "탐색" };

export default function DiscoverPage() {
  return (
    <PlaceholderScreen
      title="탐색"
      phase="Phase 3"
      description="검색과 큐레이션. 도서·저자·채널을 찾고, 장르별로 둘러본다."
      todo={[
        "검색바 (도서 제목/저자/채널명)",
        "오늘의 추천 (어드민 큐레이션)",
        "관심 분야 칩 (장르 카테고리)",
        "급상승 그리드 (최근 7일 조회수 상위)",
      ]}
    />
  );
}
