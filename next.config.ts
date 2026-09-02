import type { NextConfig } from "next";

// 도서 커버·영상은 Supabase Storage의 공개 버킷에서 온다.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  // 유튜브 영상 게시물의 시작 마스크 썸네일.
  { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
];

if (supabaseHost) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: "/storage/v1/object/public/**",
  });
}

const nextConfig: NextConfig = {
  images: { remotePatterns },
};

export default nextConfig;
