import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { Toaster } from "@ttokttok/ui/components/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

/**
 * 본문 서체는 Pretendard Variable 하나다 (DESIGN.md Typography).
 * 가변 1파일이라 굵기를 늘려도 요청이 늘지 않는다 — 소개 페이지가
 * 400·500·600·700을 섞어 쓴다. 원본: Pretendard 1.3.9 (OFL 1.1,
 * `fonts/LICENSE-Pretendard.txt`).
 */
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  weight: "45 920",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "똑똑",
    template: "%s · 똑똑",
  },
  description: "지식이 똑똑 노크해요. 숏폼으로 만나는 전자책.",
};

// 숏폼 피드는 확대/축소 시 스냅 스크롤이 깨진다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes가 하이드레이션 전에 html 클래스를 바꾸므로 경고를 끈다.
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background min-h-full">
        <Providers>{children}</Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
