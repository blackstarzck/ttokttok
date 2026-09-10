import { REGION_SCHEMA } from '@ttokttok/shared/cards';
import { BookCover } from "@ttokttok/ui/feed/book-cover";
import { formatByline } from "@ttokttok/shared/format";
import { cn } from "@ttokttok/ui/utils";
import type { RegionEntry } from "@ttokttok/ui/cards/registry";

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
  ...REGION_SCHEMA.cover,



  variants: {
    a: {
      ...REGION_SCHEMA.cover.variants.a,
      // 카드 안에서는 w-24. 큰 커버를 그대로 두면 본문이 4:5 상자를 넘고,
      // 넘침 대신 flex가 커버를 눌러 표지 비율이 깨진다(registry.ts의
      // compact 주석에 실측). 카드에는 바로 아래 도서 바가 커버를 다시
      // 보여주므로 본문의 커버가 작아도 정보가 사라지지 않는다.
      //
      // shrink-0 — TemplateCard의 flex 컬럼 안에서 이 영역이 압축되지
      // 않게 못박는다. BookCover 자신이 overflow-hidden이라(Image가
      // fill로 채우니 잘라내야 한다) flex의 자동 최소 크기가 0으로
      // 계산되어, 안 그러면 상자가 좁아질 때 다른 영역 대신 이 영역부터
      // 눌려 2:3 비율이 찌그러진다(template-card.tsx 주석 실측).
      component: ({ book, compact }) => (
        <BookCover
          book={book}
          className={cn(compact ? "w-24" : "w-36", "shrink-0 self-center")}
        />
      ),
    },
    b: {
      ...REGION_SCHEMA.cover.variants.b,
      component: ({ book }) => (
        <BookCover book={book} className="w-24 shrink-0" />
      ),
    },
  },
};

/* ── 장르 영역 ───────────────────────────────────────────────────── */

export const genreRegion: RegionEntry = {
  ...REGION_SCHEMA.genre,



  variants: {
    a: {
      ...REGION_SCHEMA.genre.variants.a,
      component: ({ book }) => (
        <span className="text-muted-foreground self-center text-xs">
          {book.category}
        </span>
      ),
    },
    b: {
      // 요구 예시 그대로: 좌측 정렬 · 20px(text-xl) · 700(font-bold)
      ...REGION_SCHEMA.genre.variants.b,
      component: ({ book }) => (
        <span className="text-xl font-bold break-keep">{book.category}</span>
      ),
    },
  },
};

/* ── 서지 영역 — 도서명 · 출판사 · 저자/옮긴이 ───────────────────── */

export const biblioRegion: RegionEntry = {
  ...REGION_SCHEMA.biblio,



  variants: {
    a: {
      ...REGION_SCHEMA.biblio.variants.a,
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
      ...REGION_SCHEMA.biblio.variants.b,
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
  ...REGION_SCHEMA.hook,


  // 훅을 원문 인용으로도 쓰기 위한 값(편집 정책). 현재 데이터는 최장 20자다.
  // 375px에서 5줄 안에 들어간다 — 설계 문서의 실측표 참조.


  variants: {
    a: {
      ...REGION_SCHEMA.hook.variants.a,
      component: ({ text }) => (
        <p className="self-center text-center text-2xl leading-snug font-bold break-keep">
          {text}
        </p>
      ),
    },
    b: {
      ...REGION_SCHEMA.hook.variants.b,
      component: ({ text }) => (
        <p className="text-2xl leading-snug font-bold break-keep">{text}</p>
      ),
    },
  },
};

/* ── 부연 설명 영역 (텍스트 입력, 선택) ──────────────────────────── */

export const descRegion: RegionEntry = {
  ...REGION_SCHEMA.desc,


  // 기존 최장 43자에 2배 여유. 375px에서 5줄.


  variants: {
    a: {
      ...REGION_SCHEMA.desc.variants.a,
      component: ({ text }) =>
        text ? (
          <p className="text-muted-foreground self-center text-center text-sm leading-relaxed break-keep">
            {text}
          </p>
        ) : null,
    },
    b: {
      ...REGION_SCHEMA.desc.variants.b,
      component: ({ text }) =>
        text ? (
          <p className="text-muted-foreground text-sm leading-relaxed break-keep">
            {text}
          </p>
        ) : null,
    },
  },
};
