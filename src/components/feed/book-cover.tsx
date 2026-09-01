import Image from "next/image";
import { cn } from "@/lib/utils";
import type { FeedBook } from "@/lib/feed";

/**
 * 도서 커버. cover_url이 없으면 타이포그래피 폴백으로 그린다.
 *
 * 폴백은 임시방편이 아니라 상시 경로다 — 저작권 만료작처럼 표지 이미지가
 * 존재하지 않는 도서가 계속 들어온다.
 *
 * overlay는 피드 크롬 안에서 쓸 때다 (하단 도서 정보 바). 기본 폴백은
 * bg-card + text-card-foreground라 밝은 카드 위에 얹으면 흰 배경에 흰
 * 글씨가 되어 사라진다. 그래서 어두운 반투명 면과 흰 글씨로 뒤집는다.
 *
 * 어느 쪽이든 aspect-[2/3]로 공간을 먼저 예약해 레이아웃 시프트를 막는다.
 */
export function BookCover({
  book,
  className,
  overlay = false,
}: {
  book: FeedBook;
  className?: string;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[2/3] overflow-hidden rounded-sm border",
        overlay
          ? "border-white/50 bg-black/[0.28]"
          : "bg-card border-border",
        className,
      )}
    >
      {book.cover_url ? (
        <Image
          src={book.cover_url}
          alt={`${book.title} 표지`}
          fill
          sizes="(max-width: 480px) 40vw, 200px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
          <span
            className={cn(
              "text-sm leading-snug font-bold break-keep",
              overlay && "feed-chrome-text text-white",
            )}
          >
            {book.title}
          </span>
          <span
            className={cn(
              "text-xs",
              overlay
                ? "feed-chrome-text text-white/90"
                : "text-muted-foreground",
            )}
          >
            {book.author}
          </span>
        </div>
      )}
    </div>
  );
}
