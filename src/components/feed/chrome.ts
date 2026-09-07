import { cn } from "@/lib/utils";

/**
 * 피드 크롬의 공통 클래스.
 * 설계: docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md
 *
 * 크롬은 게시물 유형·테마와 무관하게 한 벌이다 — 흰색 고정. 시맨틱 토큰을
 * 쓰지 않는 예외 구역이고(DESIGN.md Colors), 그 범위는 이 파일을 import하는
 * 피드 컴포넌트로 한정한다. 다른 화면에서 쓰지 말 것.
 *
 * 여기 모으는 이유: 예전에는 같은 문자열이 action-bar와 like-button에
 * 복제돼 있었다. 한 곳만 고치면 레일 안에서 색이 갈린다.
 * action-bar가 like-button을 import하므로 순환을 피해 별도 모듈로 둔다.
 */

/** 레일 액션 버튼 (좋아요·댓글·공유) 공통 껍데기. 44×44 터치 타깃을 보장한다. */
export const CHROME_ACTION = cn(
  "flex min-h-11 min-w-11 flex-col items-center",
  "justify-center gap-1 rounded-md text-white transition-opacity hover:opacity-80",
  "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2",
  "focus-visible:ring-offset-black/50 focus-visible:outline-none",
);

/** 레일 아이콘. 그림자가 밝은 배경에서 글리프 경계를 세운다. */
export const CHROME_ICON = "feed-chrome-icon size-6";

/** 카운트 숫자. text-xs = 12px로 하한을 지킨다. */
export const CHROME_COUNT = "feed-chrome-text text-xs tabular-nums";

/**
 * CTA 껍데기. "읽기"와 "도서"는 생김새가 같아야 한다 — 도서 유형이 달라도
 * 그룹 안에서 같은 위계로 읽혀야 하기 때문 (PRD §11-31).
 */
export const CHROME_CTA = cn(
  "flex flex-col items-center gap-1 rounded-md text-white",
  "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2",
  "focus-visible:ring-offset-black/50 focus-visible:outline-none",
);

/**
 * CTA 원형. 크롬 중 유일하게 색이 반전된다 — 흰 면에 어두운 아이콘.
 * 위계 최상을 지키기 위해서다. 흰 카드 위에서 면이 묻히므로 링으로
 * 가장자리를 세운다 (설계 문서 "그림자(L2)").
 */
export const CHROME_CTA_ICON = cn(
  "flex size-11 items-center justify-center rounded-full",
  "bg-white text-[#111111] transition-opacity hover:opacity-90",
  "shadow-[0_0_0_1px_rgb(0_0_0/0.22),0_1px_2px_rgb(0_0_0/0.2)]",
);

/**
 * 카드 본문 세이프존. 크롬이 컨텐츠 위에 얹히므로 본문이 스스로 피한다.
 * 이 값을 쓰는 곳은 이제 릴스·게시물 상세뿐이다(홈은 CardFeed, 평범한
 * 카드 패딩).
 *
 * 좌우 각 60px = 레일 우측 여백 8 + 레일 폭 44 + 여유 8. 좌우가 대칭이라야
 * 중앙정렬 콘텐츠가 프레임 중심에서 안 밀린다.
 * 하단 96px = 바 하단 여백 12 + 도서 바 76 + 여유 8.
 *
 * 상단 64px = 상단 바 56 + 여유 8. **이 산식의 근거는 이제 사라졌다.**
 * 원래 순수 시각 여백 20px이었다가, 홈이 아직 전면 피드였던 시절의 상단
 * 오버레이 바(결정 기록 §11-47) 때문에 좌우·하단과 같은 산식(64px)이
 * 됐다. 그런데 홈이 카드 피드로 바뀌고 그 상단 바도 구조적 헤더로
 * 바뀌면서(결정 기록 §11-49) 릴스·게시물 상세에는 애초에 피할 상단 바가
 * 없다 — 이 값이 지금 지키는 것은 존재하지 않는 크롬이다.
 * **그래도 값은 되돌리지 않는다.** `pt-16`을 되돌리는 것은 릴스의 시각적
 * 여백을 바꾸는 별개 변경이라 다음 단계(3단계, 설계 결정 9)의 몫이다 —
 * 이 브랜치에서 릴스를 건드리지 않는다.
 */
export const CHROME_SAFE_AREA = "px-15 pt-16 pb-24";
