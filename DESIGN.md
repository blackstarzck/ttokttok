---
colors:
  background: "oklch(0.145 0 0)"
  foreground: "oklch(0.985 0 0)"
  card: "oklch(0.205 0 0)"
  cardForeground: "oklch(0.985 0 0)"
  primary: "oklch(0.922 0 0)"
  primaryForeground: "oklch(0.205 0 0)"
  secondary: "oklch(0.269 0 0)"
  secondaryForeground: "oklch(0.985 0 0)"
  muted: "oklch(0.269 0 0)"
  mutedForeground: "oklch(0.708 0 0)"
  accent: "oklch(0.269 0 0)"
  accentForeground: "oklch(0.985 0 0)"
  destructive: "oklch(0.704 0.191 22.216)"
  border: "oklch(1 0 0 / 10%)"
  input: "oklch(1 0 0 / 15%)"
  ring: "oklch(0.556 0 0)"
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

1. **콘텐츠가 주인공** — UI는 무채색으로 물러나고, 색은 도서 커버와 영상이 낸다. 크롬(chrome)은 어두운 무채색, 콘텐츠 위 오버레이는 최소한으로.
2. **다크 단일 테마** — 숏폼 몰입 환경. 라이트 모드는 만들지 않지만, 모든 색은 시맨틱 토큰을 거치므로 훗날 테마 추가는 `globals.css`의 변수 블록 교체만으로 가능해야 한다.
3. **읽기가 최종 목적** — 모든 화면의 시각적 위계는 "바로 읽기" CTA로 수렴한다. 장식적 애니메이션보다 전환(피드→뷰어)의 매끄러움에 투자한다.

**토큰의 유일한 원천은 `src/app/globals.css`다.** 이 문서의 YAML은 그 사본이며, 사람이 읽는 사양서다. 토큰을 바꿀 때는 globals.css와 이 문서를 **같은 커밋에서** 함께 수정한다.

## Colors

무채색 oklch 팔레트. 유채색은 단 하나 — `destructive`(신고·삭제·오류)뿐이다.

| 토큰 | 용도 |
|---|---|
| `background` / `foreground` | 앱 바탕 / 기본 텍스트 |
| `card` / `cardForeground` | 카드·시트·모달 표면 (배경보다 한 단계 밝음) |
| `primary` / `primaryForeground` | **핵심 CTA 전용** — "바로 읽기", 발행 버튼. 다크 위의 흰 버튼이 가장 강한 위계 |
| `secondary` | 보조 버튼, 장르 칩, 뱃지 |
| `muted` / `mutedForeground` | 비활성 표면 / 보조 텍스트(저자명, 메타 정보, 카운트) |
| `accent` | hover/선택 상태 표면 (secondary와 동일 값 — 역할 분리를 위해 별도 토큰) |
| `destructive` | 신고, 삭제, 오류. **유일한 유채색** |
| `border` / `input` / `ring` | 흰색 알파 기반 경계선 / 입력 테두리 / 포커스 링 |

사용 규칙:

- 컴포넌트에서는 **시맨틱 유틸리티만** 사용한다: `bg-background`, `text-muted-foreground`, `border-border`. `bg-neutral-900`, `text-white`, `#hex` 금지.
- 피드 오버레이(영상·커버 위 텍스트)는 예외적으로 `text-white` + 그라디언트 스크림(`from-black/60`)을 쓴다 — 콘텐츠 위 가독성은 테마와 무관하게 항상 어두운 배경을 전제하기 때문. 이 예외는 피드 오버레이 컴포넌트 안에만 존재해야 한다.
- 텍스트 대비: `mutedForeground`(oklch 0.708)가 `background` 위에서 4.5:1을 만족하는 하한선이다. 이보다 어두운 텍스트를 본문에 쓰지 않는다.

## Typography

- **본문/UI: Noto Sans KR** (400/500/700). `--font-sans`에 바인딩되어 있고 `font-sans`가 기본이다.
- **모노: Geist Mono** — ISBN, 코드성 메타데이터 전용.
- 스케일은 front matter의 7단계가 전부다. 임의 크기(`text-[13px]`)를 만들지 않는다.
- 본문 최소 크기 14px, 캡션(메타 정보) 최소 12px. 12px 미만 텍스트 금지.
- `quote`는 인용구 카드 전용 — 크게, 여유 있는 행간(1.7)으로. 인용구 카드가 이 서비스의 공유 단위임을 기억할 것.
- 줄바꿈 배려: 한국어 제목류에는 `break-keep`을 적용한다.

## Layout

- **모바일 우선, 최대 480px 중앙 프레임** — `(main)` 레이아웃이 강제한다. 새 화면은 이 프레임 안에서 설계한다.
- 간격은 4px 배수 스케일(front matter `spacing`)만 사용. 화면 기본 패딩 `md`(16px), 섹션 간 `lg`(24px).
- **피드는 예외 레이아웃**: `100dvh` 스냅 스크롤, 패딩 없는 풀블리드. safe-area는 `env(safe-area-inset-*)`로 처리 (BottomNav에 적용된 패턴을 따를 것).
- 터치 타깃 최소 44×44px, 인접 타깃 간 8px 이상.
- 가로 스크롤은 카드 캐러셀 내부에만 존재한다. 페이지 레벨 가로 스크롤 금지.

## Elevation & Depth

그림자를 쓰지 않는다. 다크 단일 테마에서 깊이는 **표면 밝기 단차 + 경계선**으로 표현한다:

1. `background` (가장 깊음) → 2. `card` (+1단계) → 3. 오버레이/시트 (`card` + `border`)
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
