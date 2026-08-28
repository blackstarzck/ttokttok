import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  preload: false,
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
      className={`${notoSansKR.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background min-h-full">
        <Providers>{children}</Providers>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
