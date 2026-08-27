import { PlaceholderScreen } from "@/components/layout/placeholder-screen";

export default function HomePage() {
  return (
    <PlaceholderScreen
      title="홈 피드"
      phase="Phase 1"
      description="세로 스냅 스크롤 피드. 카드 게시물은 좌우 스와이프, 영상 게시물은 풀스크린 자동재생."
      todo={[
        "게시물 세로 스냅 스크롤 + 가상화",
        "카드 캐러셀 (template_category → 컴포넌트 레지스트리)",
        "우측 액션 바 (좋아요/댓글/공유) + 바로 읽기 CTA",
        "조회 로깅 (IntersectionObserver, 1초 기준)",
      ]}
    />
  );
}
