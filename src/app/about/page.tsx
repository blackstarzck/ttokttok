import type { Metadata } from "next";
import { AboutNav } from "@/components/about/about-nav";
import { AboutFooter } from "@/components/about/about-footer";

const DESCRIPTION =
  "숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 서비스, 똑똑을 소개합니다.";

export const metadata: Metadata = {
  // 루트 레이아웃의 template("%s · 똑똑")이 붙어 "소개 · 똑똑"이 된다.
  title: "소개",
  description: DESCRIPTION,
  openGraph: {
    title: "똑똑 소개",
    description: DESCRIPTION,
    type: "website",
  },
};

export default async function AboutPage() {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <AboutNav />
      <main>{/* 섹션은 Task 2 이후에 채운다 */}</main>
      <AboutFooter />
    </div>
  );
}
