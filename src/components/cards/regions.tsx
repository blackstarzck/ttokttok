import { BookCover } from "@/components/feed/book-cover";
import { formatByline } from "@/lib/format";
import type { RegionEntry } from "@/components/cards/registry";

/**
 * 영역 컴포넌트 (PRD §5.2, FRONTEND.md §3).
 *
 * 게시물 본문 한 장을 이루는 조각들이다. 각 영역은 UI 유형(variant)을
 * 여러 개 가지며, 관리자가 게시물마다 유형을 고른다.
 *
 * 규약: **순수 컴포넌트여야 한다** — fetch·effect·집계 호출 금지. 어드민
 * 미리보기가 같은 컴포넌트를 그대로 렌더하므로, 부수효과를 넣으면
 * 관리자가 편집하는 동안 그것이 실행된다. 데이터는 book과 text에서만 온다.
 *
 * 정렬 규약: 부모(TemplateCard)는 좌측 정렬 세로 스택이다. 중앙 유형은
 * 스스로 self-center / text-center를 갖는다.
 */

/* ── 도서(커버) 영역 ─────────────────────────────────────────────── */

export const coverRegion: RegionEntry = {
  label: "도서 커버",
  input: null,
  required: false,
  defaultVariant: "a",
  variants: {
    a: {
      label: "중앙 표준",
      component: ({ book }) => <BookCover book={book} className="w-36 self-center" />,
    },
    b: {
      label: "좌측 소형",
      component: ({ book }) => <BookCover book={book} className="w-24" />,
    },
  },
};

/* ── 장르 영역 ───────────────────────────────────────────────────── */

export const genreRegion: RegionEntry = {
  label: "장르",
  input: null,
  required: false,
  defaultVariant: "a",
  variants: {
    a: {
      label: "캡션",
      component: ({ book }) => (
        <span className="text-muted-foreground self-center text-xs">
          {book.category}
        </span>
      ),
    },
    b: {
      // 요구 예시 그대로: 좌측 정렬 · 20px(text-xl) · 700(font-bold)
      label: "헤드라인",
      component: ({ book }) => (
        <span className="text-xl font-bold break-keep">{book.category}</span>
      ),
    },
  },
};

/* ── 서지 영역 — 도서명 · 출판사 · 저자/옮긴이 ───────────────────── */

export const biblioRegion: RegionEntry = {
  label: "서지 (도서명·출판사·저자/옮긴이)",
  input: null,
  required: false,
  defaultVariant: "a",
  variants: {
    a: {
      label: "중앙",
      component: ({ book }) => (
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-lg leading-snug font-medium break-keep">
            {book.title}
          </h2>
          <p className="text-muted-foreground text-xs">{formatByline(book)}</p>
        </div>
      ),
    },
    b: {
      label: "좌측",
      component: ({ book }) => (
        <div className="flex flex-col gap-1">
          <h2 className="text-lg leading-snug font-medium break-keep">
            {book.title}
          </h2>
          <p className="text-muted-foreground text-xs">{formatByline(book)}</p>
        </div>
      ),
    },
  },
};

/* ── 훅 영역 (텍스트 입력, 필수) ─────────────────────────────────── */

export const hookRegion: RegionEntry = {
  label: "훅",
  input: "text",
  required: true,
  // 훅을 원문 인용으로도 쓰기 위한 값(편집 정책). 현재 데이터는 최장 20자다.
  // 375px에서 5줄 안에 들어간다 — 설계 문서의 실측표 참조.
  maxLength: 60,
  defaultVariant: "a",
  variants: {
    a: {
      label: "중앙 강조",
      component: ({ text }) => (
        <p className="self-center text-center text-xl leading-snug font-bold break-keep">
          {text}
        </p>
      ),
    },
    b: {
      label: "좌측",
      component: ({ text }) => (
        <p className="text-xl leading-snug font-bold break-keep">{text}</p>
      ),
    },
  },
};

/* ── 부연 설명 영역 (텍스트 입력, 선택) ──────────────────────────── */

export const descRegion: RegionEntry = {
  label: "부연 설명",
  input: "textarea",
  required: false,
  // 기존 최장 43자에 2배 여유. 375px에서 5줄.
  maxLength: 90,
  defaultVariant: "a",
  variants: {
    a: {
      label: "중앙",
      component: ({ text }) =>
        text ? (
          <p className="text-muted-foreground self-center text-center text-sm leading-relaxed break-keep">
            {text}
          </p>
        ) : null,
    },
    b: {
      label: "좌측",
      component: ({ text }) =>
        text ? (
          <p className="text-muted-foreground text-sm leading-relaxed break-keep">
            {text}
          </p>
        ) : null,
    },
  },
};
