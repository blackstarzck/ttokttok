import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { resolvePostThumbnail } from "@ttokttok/shared/post-thumbnail";
import type { FeedPost } from "@ttokttok/shared/feed";
import type { CSSProperties } from "react";

/**
 * 채널 그리드 타일 하나 (설계 §1.3).
 *
 * 무엇을 그릴지는 `resolvePostThumbnail`이 정했다 — 여기는 그 결과를
 * 정방형에 얹기만 한다. 라운딩이 없는 이유: 타일이 빈틈없이 이어지는
 * 모자이크라서다. 조회수도 없다 — 밑에 글자가 붙으면 모자이크가 깨지고
 * 수치는 상세 액션 줄에서 본다.
 *
 * 이미지 타일의 바탕이 `--post-navy`인 이유: 이미지가 404여도 밝은 잉크의
 * 훅 문구가 읽히도록. 단색 타일은 저장된 색(없으면 종이색)이다.
 *
 * 재생 글리프의 `bg-black/50` 원은 영상 음소거 버튼과 같은 외피다 —
 * 콘텐츠 픽셀 위 흰색 고정 크롬 면제(DESIGN.md Colors).
 */
export function PostTile({ post, href }: { post: FeedPost; href: string }) {
  const thumb = resolvePostThumbnail(post);
  const style = {
    backgroundColor:
      thumb.kind === "solid"
        ? (thumb.color ?? "var(--post-paper)")
        : "var(--post-navy)",
    color: thumb.ink === "light" ? "var(--post-ink-light)" : "var(--post-ink-dark)",
  } satisfies CSSProperties;

  return (
    <Link
      href={href}
      aria-label={`${post.books.title} ${post.type === "video" ? "영상" : "카드"} 게시물`}
      className="focus-visible:ring-ring relative block aspect-square overflow-hidden focus-visible:ring-2 focus-visible:outline-none"
      style={style}
    >
      {thumb.kind === "image" ? (
        <>
          <Image
            src={thumb.src}
            alt=""
            fill
            sizes="(max-width: 480px) 33vw, 160px"
            className="object-cover"
            style={{ objectPosition: `${thumb.x}% ${thumb.y}%` }}
          />
          {thumb.dim > 0 ? (
            <div
              aria-hidden
              className="card-background-dim absolute inset-0"
              style={{ opacity: thumb.dim / 100 }}
            />
          ) : null}
        </>
      ) : null}

      {thumb.text ? (
        <span className="absolute inset-x-0 bottom-0 line-clamp-3 p-2 text-xs leading-snug font-bold break-keep">
          {thumb.text}
        </span>
      ) : null}

      {thumb.video ? (
        <span
          aria-hidden
          className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <Play className="size-4" />
        </span>
      ) : null}
    </Link>
  );
}
