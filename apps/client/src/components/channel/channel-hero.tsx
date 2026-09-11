import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@ttokttok/ui/components/avatar";
import type { ReactNode } from "react";

export type ChannelHeroChannel = {
  name: string;
  slug: string;
  genre: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
};

/**
 * 채널 홈 히어로 (설계 §1.1). 참고 화면의 "커버 사진 위에 뒤로가기·아바타·
 * 이름·액션 바"를 옮긴 것이다.
 *
 * **높이는 `aspect-[3/4]`가 하한이고 내용이 더 길면 자란다.** 배경(이미지·
 * 스크림)은 `absolute inset-0 overflow-hidden` 래퍼 안에 두고 섹션 자체에는
 * overflow를 걸지 않는다 — `overflow: hidden`은 스크롤 컨테이너라 aspect-ratio
 * 상자의 자동 최소 높이가 0이 되어 긴 소개가 잘린다(css-sizing-4 §5.2).
 * 래퍼는 섹션과 함께 자라므로 배경은 항상 꽉 찬다.
 *
 * 배경 세 단계: cover_url → 아바타 블러 → `--post-navy`. 맨 밑 navy는 이미지가
 * 404여도 흰 글자 대비를 지키기 위한 것이다. 스크림은 하단 60%, 검정 0.7에서
 * 투명으로 전 구간 단조 감소 — `post-item.tsx` 하단 스크림과 같은 성격이고
 * 같은 이유로 인라인 스타일이다(v3/v4 그라디언트 클래스 이름 차이).
 *
 * 흰색 고정 크롬은 커버 위라서다 — DESIGN.md Colors "채널 히어로 크롬" 면제.
 * 상단 스크림은 없다 — 뒤로가기가 자기 `bg-black/50` 원을 갖는다(음소거 버튼 선례).
 */
export function ChannelHero({
  channel,
  postCount,
  actions,
}: {
  channel: ChannelHeroChannel;
  /** 이미 포맷된 문자열 — 카운트 실패면 "–". */
  postCount: string;
  actions: ReactNode;
}) {
  const background = channel.cover_url ?? channel.avatar_url;

  return (
    <section className="relative flex aspect-[3/4] flex-col justify-end">
      <div
        aria-hidden
        className="absolute inset-0 overflow-hidden"
        style={{ backgroundColor: "var(--post-navy)" }}
      >
        {background ? (
          <Image
            src={background}
            alt=""
            fill
            priority
            sizes="(max-width: 480px) 100vw, 480px"
            className={
              channel.cover_url ? "object-cover" : "scale-110 object-cover blur-2xl"
            }
          />
        ) : null}
        <div
          className="absolute inset-x-0 bottom-0 h-3/5"
          style={{
            background:
              "linear-gradient(to top, rgb(0 0 0 / 0.7) 0%, rgb(0 0 0 / 0.42) 35%, rgb(0 0 0 / 0.22) 60%, rgb(0 0 0 / 0.08) 80%, transparent 100%)",
          }}
        />
      </div>

      <Link
        href="/"
        aria-label="피드로 돌아가기"
        className="absolute top-4 left-4 flex size-11 items-center justify-center rounded-full bg-black/50 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      >
        <ChevronLeft aria-hidden />
      </Link>

      <div className="relative flex flex-col gap-3 p-4">
        <Avatar className="size-20 border-2 border-white/80 after:hidden">
          {channel.avatar_url ? <AvatarImage src={channel.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-2xl">{channel.name.slice(0, 1)}</AvatarFallback>
        </Avatar>

        <h1 className="feed-chrome-text text-2xl font-bold text-white break-keep">
          {channel.name}
        </h1>

        <div className="flex items-center gap-2 text-xs text-white/90">
          <span className="rounded-full border border-white/40 px-3 py-1.5 text-white">
            {channel.genre}
          </span>
          <span>게시물 {postCount}</span>
        </div>

        {channel.description ? (
          <p className="feed-chrome-text line-clamp-2 text-sm leading-relaxed text-white/90 break-keep">
            {channel.description}
          </p>
        ) : null}

        {actions}
      </div>
    </section>
  );
}
