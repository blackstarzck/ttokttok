"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";

export type BookOption = {
  id: string;
  title: string;
  author: string;
  /** 이 도서에 이미 달린 게시물 수 (임시저장 포함). */
  postCount: number;
};

const selectClass =
  "border-input bg-background focus-visible:ring-ring h-11 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none";

/**
 * 도서 선택 + 중복 경고 (PRD §5.10).
 *
 * 한 도서에 게시물이 여러 개인 것 자체는 막지 않는다 — 피드가 그걸 전제로
 * 설계돼 있다(lib/feed.ts의 spreadByBook이 같은 도서 게시물을 흩뿌린다).
 * 다만 같은 도서에 무한정 쌓는 실수를 알아채도록 기존 개수를 보여준다.
 *
 * 카드 폼과 영상 폼이 같은 규칙을 써야 해서 공용으로 뺐다.
 */
export function BookSelect({
  books,
  defaultValue,
  currentBookId = null,
  onValueChange,
}: {
  books: BookOption[];
  defaultValue?: string;
  /** 수정 중인 게시물의 도서. 자기 자신은 중복으로 세지 않는다. */
  currentBookId?: string | null;
  /**
   * 선택이 바뀔 때 알린다 (카드 폼의 미리보기가 듣는다).
   *
   * 값의 주인은 여전히 이 컴포넌트다 — 제출되는 폼 필드가 여기 있기
   * 때문이다. 바깥은 통보를 받을 뿐 되쓰지 않는다.
   */
  onValueChange?: (bookId: string) => void;
}) {
  const [bookId, setBookId] = useState(defaultValue ?? "");

  /**
   * 수정 중인 게시물 자신은 빼고 센다. 라벨과 경고가 같은 수를 말해야
   * 한다 — 하나는 3, 하나는 2라고 하면 어느 쪽이 맞는지 알 수 없다.
   */
  const otherPosts = (b: BookOption) =>
    b.postCount - (currentBookId === b.id ? 1 : 0);

  const selected = books.find((b) => b.id === bookId);
  const existing = selected ? otherPosts(selected) : 0;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="book_id">도서 *</Label>
      <select
        id="book_id"
        name="book_id"
        value={bookId}
        onChange={(e) => {
          setBookId(e.target.value);
          onValueChange?.(e.target.value);
        }}
        required
        className={selectClass}
      >
        <option value="" disabled>
          선택하세요
        </option>
        {books.map((b) => {
          const count = otherPosts(b);
          return (
            <option key={b.id} value={b.id}>
              {b.title} — {b.author}
              {count > 0 ? ` (게시물 ${count})` : ""}
            </option>
          );
        })}
      </select>

      {existing > 0 ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            이 도서에는 이미 게시물 {existing}개가 있습니다. 의도한 게 맞다면
            그대로 저장하세요.
          </span>
        </p>
      ) : null}
    </div>
  );
}
