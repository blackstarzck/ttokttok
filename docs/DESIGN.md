---
colors:
  background: "oklch(0.98 0 0)"
  foreground: "oklch(0.145 0 0)"
  card: "oklch(1 0 0)"
  cardForeground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primaryForeground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  secondaryForeground: "oklch(0.205 0 0)"
  muted: "oklch(0.97 0 0)"
  mutedForeground: "oklch(0.53 0 0)"
  accent: "oklch(0.97 0 0)"
  accentForeground: "oklch(0.205 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.9 0 0)"
  input: "oklch(0.9 0 0)"
  ring: "oklch(0.708 0 0)"
typography:
  body:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  bodySmall:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  titleScreen:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.35
  titleSection:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
  titleCard:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.45
  quote:
    fontFamily: "Noto Sans KR, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.7
  mono:
    fontFamily: "Geist Mono, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  "2xl": "48px"
components:
  buttonPrimary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    typography: "{typography.bodySmall}"
    padding: "10px 16px"
  buttonSecondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondaryForeground}"
    typography: "{typography.bodySmall}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.cardForeground}"
    padding: "{spacing.md}"
  bottomNav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.mutedForeground}"
    typography: "{typography.caption}"
  genreChip:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondaryForeground}"
    typography: "{typography.caption}"
    padding: "6px 12px"
---

# 똑똑 (Ttokttok) Design System

## Overview

**"지식이 똑똑 노크해요."** 숏폼 피드로 책을 발견하고 그 자리에서 읽기 시작하는 모바일 웹 서비스.

디자인 원칙 세 가지:

1. **콘텐츠가 주인공** — UI는 무채색으로 물러나고, 색은 도서 커버와 영상이 낸다. 크롬(chrome)은 테마의 무채색을 따르고, 콘텐츠 위 오버레이는 최소한으로.
2. **라이트 기본, 다크 선택** — 기본은 라이트이고 사용자가 프로필에서 라이트·다크·시스템을 고른다 (결정 기록 §11-34). 모든 색이 시맨틱 토큰을 거치므로 테마 전환은 `globals.css`의 `:root`·`.dark` 변수 블록만으로 끝난다 — 컴포넌트는 손대지 않는다. **어드민(/admin)만 라이트 고정**이다 — 데이터 입력 화면이라 테마 선택지를 주지 않는다 (§11-35).
3. **읽기가 최종 목적** — 모든 화면의 시각적 위계는 "바로 읽기" CTA로 수렴한다. 장식적 애니메이션보다 전환(피드→뷰어)의 매끄러움에 투자한다.

**토큰의 유일한 원천은 `src/app/globals.css`다.** 이 문서의 YAML은 그 사본이며, 사람이 읽는 사양서다. 토큰을 바꿀 때는 globals.css와 이 문서를 **같은 커밋에서** 함께 수정한다.

## Colors

무채색 oklch 팔레트. 유채색은 단 하나 — `destructive`(신고·삭제·오류)뿐이다.

아래 표는 **역할**을 정의한다. 실제 값은 테마마다 다르고 `globals.css`의 `:root`(라이트)·`.dark`(다크) 두 블록에 산다. 컴포넌트는 역할 이름만 쓰므로 테마를 몰라도 된다.

| 토큰 | 용도 |
|---|---|
| `background` / `foreground` | 앱 바탕 / 기본 텍스트 |
| `card` / `cardForeground` | 카드·시트·모달 표면 (배경보다 한 단계 밝음) |
| `primary` / `primaryForeground` | **핵심 CTA 전용** — "바로 읽기", 발행 버튼. 바탕과 가장 멀리 떨어진 명도라 위계가 가장 강하다 (라이트에선 검정, 다크에선 흰색) |
| `secondary` | 보조 버튼, 장르 칩, 뱃지 |
| `muted` / `mutedForeground` | 비활성 표면 / 보조 텍스트(저자명, 메타 정보, 카운트) |
| `accent` | hover/선택 상태 표면 (secondary와 동일 값 — 역할 분리를 위해 별도 토큰) |
| `destructive` | 신고, 삭제, 오류. **유일한 유채색** |
| `border` / `input` / `ring` | 경계선 / 입력 테두리 / 포커스 링 (라이트는 불투명 회색, 다크는 흰색 알파) |

사용 규칙:

- 컴포넌트에서는 **시맨틱 유틸리티만** 사용한다: `bg-background`, `text-muted-foreground`, `border-border`. `bg-neutral-900`, `text-white`, `#hex` 금지.
- **피드 크롬은 테마 면제 구역이다.** 액션 레일과 도서 정보 바는 게시물 유형·테마와 무관하게 흰색 고정(`#ffffff`, 보조 텍스트 `rgb(255 255 255 / 0.9)`)이고, 컨텐츠 영역 하단의 검정 스크림 `linear-gradient(to top, rgb(0 0 0 / 0.55), transparent)` 160px가 대비를 만든다. 시맨틱 토큰을 쓰지 않는 유일한 예외이며, 범위는 **피드 게시물 위에 얹히는 크롬**으로 한정한다 — 구체적으로 `src/components/feed/chrome.ts`의 상수들과 `BookCover`의 `overlay` 변형이다. `BookCover`는 탐색 그리드에서도 쓰이므로 `chrome.ts`를 import하지 않는다. 기본 변형은 지금처럼 시맨틱 토큰을 쓰고, 면제는 `overlay` 분기 안에만 존재한다. 근거와 실측은 `docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md`.
- **외부 브랜드 자산**도 예외다. 소셜로그인 버튼의 카카오 노란색(`#FEE500`)처럼 제공사가 색을 규정한 경우는 원시 값을 쓴다 — 토큰으로 바꾸면 브랜드 가이드 위반이다. 이 예외는 `components/auth/` 안에만 둔다.
- 상태를 색으로만 말하지 않는다. 좋아요한 하트는 빨강이 아니라 **채움**으로 구분한다 — 유채색은 도서 표지의 몫이고, 색맹 사용자에게도 형태가 더 확실하다.
- 텍스트 대비: `mutedForeground`가 `background` 위에서 **4.5:1**을 만족하는 하한선이다 (측정값 — 라이트 4.94, 다크 7.66). 이보다 흐린 텍스트를 본문에 쓰지 않는다. 토큰을 조정하면 두 테마 모두 다시 재보아야 한다.

## Typography

- **본문/UI: Noto Sans KR** (400/500/700). `--font-sans`에 바인딩되어 있고 `font-sans`가 기본이다.
- **모노: Geist Mono** — ISBN, 코드성 메타데이터 전용.
- 스케일은 front matter의 7단계가 전부다. 임의 크기(`text-[13px]`)를 만들지 않는다.
- 본문 최소 크기 14px, 캡션(메타 정보) 최소 12px. 12px 미만 텍스트 금지.
- `quote`는 도서 상세 시트의 인용구 전용 — 크게, 여유 있는 행간(1.7)으로. 인용구는 게시물이 아니라 도서의 메타정보다 (PRD §5.12).
- 줄바꿈 배려: 한국어 제목류에는 `break-keep`을 적용한다.

## Layout

- **모바일 우선, 최대 480px 중앙 프레임** — `(main)` 레이아웃이 강제한다. 새 화면은 이 프레임 안에서 설계한다.
- 간격은 4px 배수 스케일(front matter `spacing`)만 사용. 화면 기본 패딩 `md`(16px), 섹션 간 `lg`(24px).
- **셸 높이**: `(main)` 레이아웃이 `h-dvh` 고정 + `main`에 `min-h-0`을 준다. 각 화면은 `h-full`로 채우고 필요하면 스스로 스크롤한다 — 피드가 자기 높이를 정확히 알아야 스냅이 성립하기 때문이다.
- **피드는 예외 레이아웃**: 셸 높이(= `100dvh` − BottomNav)를 채우는 자체 스냅 스크롤 컨테이너. 패딩 없는 풀블리드. safe-area는 `env(safe-area-inset-*)`로 처리 (BottomNav에 적용된 패턴을 따를 것).
- **피드 세이프존**: 크롬이 컨텐츠 위에 얹히므로 카드 본문이 스스로 피한다 — 좌우 각 60px(레일 우측 여백 8 + 레일 폭 44 + 여유 8), 하단 84px(도서 정보 바 76 + 여유 8), 상단 20px. **좌우는 반드시 대칭**이라야 중앙정렬 콘텐츠가 프레임 중심에서 밀리지 않는다.
- **z 스케일**: 본문 0 → 스크림 2 → 크롬 3 → `BottomNav` 50 → 시트·모달(Radix portal). 새 오버레이는 이 스케일 안에 배치한다.
- 터치 타깃 최소 44×44px, 인접 타깃 간 8px 이상.
- 가로 스크롤은 카드 캐러셀 내부에만 존재한다. 페이지 레벨 가로 스크롤 금지.

## Elevation & Depth

그림자를 쓰지 않는다. 깊이는 **표면 밝기 단차 + 경계선**으로 표현한다:

> 예외: 피드 크롬의 **콘텐츠 위 가독성** 확보에 한해 그림자를 쓴다. 깊이 표현이 아니라 밝은 카드 위에서 흰 글리프의 경계를 세우는 용도다. 유틸은 `globals.css`의 `.feed-chrome-icon` / `.feed-chrome-text` 두 개뿐이고, 그 밖의 그림자는 여전히 금지다.

1. `background` (가장 깊음) → 2. `card` (+1단계) → 3. 오버레이/시트 (`card` + `border`)

두 테마 모두 **`card`가 `background`보다 밝다**. 그래서 라이트에서 바탕은 순백이 아니라 살짝 낮은 회백(`oklch(0.98)`)이고 카드가 순백이다 — 둘 다 순백이면 단차가 0이 되어 이 규칙이 무너진다.
- 모달·드로어의 배경 딤은 `bg-black/60`.
- 플로팅 요소(BottomNav 등)는 `backdrop-blur` + 반투명 배경으로 콘텐츠 위에 뜬다.

## Shapes

- 기본 라운딩: 카드·시트 `lg`(10px), 버튼·입력 `md`(8px), 칩·뱃지 `full`.
- 아바타는 원형(`full`). 도서 커버는 실물 은유를 위해 `sm`(6px)로 각을 살린다.
- 라운딩 값은 `--radius` 파생 토큰(`rounded-sm`~`rounded-xl`)만 사용. 임의 값 금지.

## Components

- **shadcn/ui가 컴포넌트 기반**이다 (radix base, nova preset). `src/components/ui/`의 변형을 우선 사용하고, 없으면 shadcn 레지스트리에서 추가한다.
- 버튼 위계: 화면당 `primary` 버튼은 **하나**("바로 읽기" 등 핵심 전환). 나머지는 `secondary`/`ghost`.
- 모바일 인터랙션 표면은 Dialog가 아니라 **Drawer(바텀시트)** 가 기본이다: 댓글, 도서 상세(더보기), 로그인 유도.
- 아이콘은 lucide-react만. 이모지를 아이콘으로 쓰지 않는다.
- 로딩은 스피너 대신 **Skeleton** — 실제 콘텐츠와 같은 크기로 그려 CLS를 막는다.
- 피드백(찜 완료, 링크 복사)은 Sonner 토스트, `position: top-center`.

## Do's and Don'ts

**Do**

- 새 색·크기·간격이 필요하면 **먼저 globals.css에 토큰을 추가**하고, 이 문서에 반영한 뒤 사용한다.
- 상태(hover/active/disabled/focus-visible)를 모든 인터랙티브 요소에 정의한다. 포커스 링(`ring`)을 제거하지 않는다.
- 애니메이션은 150–300ms, `transform`/`opacity`만. `prefers-reduced-motion` 존중.
- 이미지·영상 영역은 로드 전 크기를 예약한다 (aspect-ratio 또는 Skeleton).

**Don't**

- 원시 hex/oklch/px를 컴포넌트에 쓰지 않는다 — 토큰이 없다는 신호다.
- Tailwind 팔레트 직접 참조(`bg-zinc-800`) 금지 — 테마 교체를 부순다.
- 컴포넌트별 `.css` 파일, `globals.css`에 화면 전용 스타일 추가 금지.
- 그림자로 위계 표현 금지 (Elevation 규칙 참조).
- 화면당 두 개 이상의 primary 버튼 금지.
- `width`/`height` 애니메이션, 데코레이션 목적의 무한 애니메이션 금지.
