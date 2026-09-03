"use client";

import { useState } from "react";
import Link from "next/link";
import { BookCover } from "@/components/feed/book-cover";
import { timeAgo } from "@/lib/comments";
import { cn } from "@/lib/utils";
import type { LikedPost, MyComment } from "@/lib/activity";

/**
 * 프로필 활동 탭 (설계 결정 18).
 *
 * 데이터는 서버 컴포넌트가 가져오고 여기서는 어느 쪽을 보여줄지만 고른다 —
 * 상태가 필요한 최소 단위만 클라이언트다 (FRONTEND.md §2).
 *
 * 좋아요한 게시물을 탭하면 도서 시트가 아니라 **게시물로** 간다. 좋아요는
 * 게시물에 한 것이라, 도서로 보내면 무엇을 좋아요했는지가 사라지고 보관함과
 * 구별되지 않는다.
 */
export function ActivityTab({
  likedPosts,
  comments,
}: {
  likedPosts: LikedPost[];
  comments: MyComment[];
}) {
  const [tab, setTab] = useState<"likes" | "comments">("likes");

  return (
    <div className="flex flex-col gap-4">
      {/* gap-2 = 8px. DESIGN.md는 44×44와 함께 인접 타깃 간 8px을 규정한다. */}
      <div className="flex gap-2">
        {(
          [
            ["likes", `좋아요 ${likedPosts.length}`],
            ["comments", `내 댓글 ${comments.length}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={cn(
              "focus-visible:ring-ring min-h-11 flex-1 rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              tab === key
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "likes" ? (
        likedPosts.length ? (
          <ul className="grid grid-cols-3 gap-3">
            {likedPosts.map(({ postId, book }) => (
              <li key={postId}>
                <Link
                  href={`/p/${postId}`}
                  className="focus-visible:ring-ring flex flex-col gap-1.5 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                >
                  <BookCover book={book} className="w-full" />
                  <span className="line-clamp-2 text-xs leading-snug break-keep">
                    {book.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-10 text-center text-sm">
            아직 좋아요한 게시물이 없어요.
          </p>
        )
      ) : comments.length ? (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <Link
                href={`/p/${c.postId}`}
                className="hover:bg-accent focus-visible:ring-ring flex min-h-11 flex-col gap-1 rounded-lg p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="truncate break-keep">{c.bookTitle}</span>
                  <span className="shrink-0">{timeAgo(c.createdAt)}</span>
                </span>
                <span className="line-clamp-2 text-sm leading-relaxed break-keep">
                  {c.content}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-10 text-center text-sm">
          아직 쓴 댓글이 없어요.
        </p>
      )}
    </div>
  );
}
