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
    fontFamily: "Pretendard Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  bodySmall:
    fontFamily: "Pretendard Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Pretendard Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  titleScreen:
    fontFamily: "Pretendard Variable, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.35
  titleSection:
    fontFamily: "Pretendard Variable, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
  titleCard:
    fontFamily: "Pretendard Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.45
  quote:
    fontFamily: "Pretendard Variable, sans-serif"
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

1. **콘텐츠가 주인공** — 문장·배경색·이미지로 게시글의 인상을 만든다. 채널·도서·버튼 영역은 무채색을 유지한다. 크롬(chrome)은 테마의 무채색을 따르고, 콘텐츠 위 오버레이는 최소한으로. **예외: 피드 크롬**(액션 레일·도서 정보 바)은 이 원칙에서 면제된다 — 밑에 깔리는 것이 임의의 콘텐츠 픽셀이라 테마를 따르면 판독성을 보장할 수 없기 때문이다. 근거와 범위는 아래 Colors 절과 `docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md`.
2. **라이트 기본, 다크 선택** — 기본은 라이트이고 사용자가 프로필에서 라이트·다크·시스템을 고른다 (결정 기록 §11-34). 모든 색이 시맨틱 토큰을 거치므로 테마 전환은 `globals.css`의 `:root`·`.dark` 변수 블록만으로 끝난다 — 컴포넌트는 손대지 않는다. **어드민(/admin)만 라이트 고정**이다 — 데이터 입력 화면이라 테마 선택지를 주지 않는다 (§11-35).
3. **읽기가 최종 목적** — 모든 화면의 시각적 위계는 "바로 읽기" CTA로 수렴한다. 장식적 애니메이션보다 전환(피드→뷰어)의 매끄러움에 투자한다.

**토큰의 유일한 원천은 `packages/ui/src/theme.css`다.** 이 문서의 YAML은 그 사본이며, 사람이 읽는 사양서다. 토큰을 바꿀 때는 theme.css와 이 문서를 **같은 커밋에서** 함께 수정한다.

## Colors

앱 조작 영역은 무채색 oklch 팔레트를 사용한다. 게시글 중앙 배경과 표지 제작물은 콘텐츠 전용 색상으로 앱 테마와 독립적이다.

아래 표는 **역할**을 정의한다. 실제 값은 테마마다 다르고 `globals.css`의 `:root`(라이트)·`.dark`(다크) 두 블록에 산다. 컴포넌트는 역할 이름만 쓰므로 테마를 몰라도 된다.

| 토큰 | 용도 |
|---|---|
| `background` / `foreground` | 앱 바탕 / 기본 텍스트 |
| `card` / `cardForeground` | 카드·시트·모달 표면 (배경보다 한 단계 밝음) |
| `primary` / `primaryForeground` | **핵심 CTA 전용** — "바로 읽기", 발행 버튼. 바탕과 가장 멀리 떨어진 명도라 위계가 가장 강하다 (라이트에선 검정, 다크에선 흰색) |
| `secondary` | 보조 버튼, 장르 칩, 뱃지 |
| `muted` / `mutedForeground` | 비활성 표면 / 보조 텍스트(저자명, 메타 정보, 카운트) |
| `accent` | hover/선택 상태 표면 (secondary와 동일 값 — 역할 분리를 위해 별도 토큰) |
| `destructive` | 신고, 삭제, 오류, 안 읽음 배지(`UnreadBadge`). **유일한 유채색** |
| `border` / `input` / `ring` | 경계선 / 입력 테두리 / 포커스 링 (라이트는 불투명 회색, 다크는 흰색 알파) |

사용 규칙:

- 컴포넌트에서는 **시맨틱 유틸리티만** 사용한다: `bg-background`, `text-muted-foreground`, `border-border`. `bg-neutral-900`, `text-white`, `#hex` 금지.
- **피드 크롬은 테마 면제 구역이다.** 액션 레일과 도서 정보 바는 게시물 유형·테마와 무관하게 흰색 고정(`#ffffff`, 보조 텍스트 `rgb(255 255 255 / 0.9)`)이고, 컨텐츠 영역 하단의 검정 이징 스크림 120px(`rgb(0 0 0 / 0.45)` → 투명, 전 구간 단조 감소 — 정확한 스톱은 설계 문서 "스크림")가 대비를 만든다. **상단 스크림은 없다** — 한때 96px가 있었지만 그건 홈이 전면 피드이던 시절 흰색 고정 상단 바를 위한 것이었고, 그 바가 구조적 헤더로 옮겨가며(§11-53) 지킬 대상이 사라져 걷어냈다(§11-57). 상단에 남은 유일한 크롬인 음소거 버튼은 자기 `bg-black/50`을 갖는다. 시맨틱 토큰을 쓰지 않는 두 예외 중 하나이며, 범위는 **피드 게시물 위에 얹히는 크롬**으로 한정한다 — 구체적으로 `packages/ui/src/feed/chrome.ts`의 상수들, `BookCover`의 `overlay` 변형, `post-item.tsx`의 크롬 부분(도서 정보 바 텍스트·채널 아바타·하단 스크림), `video-player.tsx`의 음소거 버튼이다. `BookCover`는 탐색 그리드에서도 쓰이므로 `chrome.ts`를 import하지 않는다. 기본 변형은 지금처럼 시맨틱 토큰을 쓰고, 면제는 `overlay` 분기 안에만 존재한다. 근거와 실측은 `docs/superpowers/specs/2026-09-01-home-feed-overlay-design.md`. **이 면제는 홈 카드(`post-card.tsx`, `card-actions.tsx`)에는 적용되지 않는다** — 카드는 밑에 깔리는 것이 `card` 표면(불투명 배경)이지 임의의 콘텐츠 픽셀이 아니라서, 판독성을 걱정할 이유가 애초에 없다. `LikeButton`이 `surface` prop으로 크롬 스타일과 카드 스타일을 가르는 것도 같은 이유다 — 카드 쪽은 항상 시맨틱 토큰(`text-muted-foreground` 등)만 쓴다. **`top-bar.tsx`·`unread-badge.tsx`(홈 상단 바와 알림 배지)는 여기 속하지 않는다** — 예전에는 이 예외 목록에 있었지만, 홈 상단 바가 오버레이에서 구조적 헤더로 바뀌며(IA 결정 기록 §11-53) 밑에 깔리는 것이 `background` 표면(페이지·셸 배경)이 됐다. 그 상태로 흰색 고정을 남겨 두면 라이트 테마에서 로고·배지가 배경과 거의 같은 명도가 되어 안 보인다 — 그래서 시맨틱 토큰(`bg-background`, `text-foreground`, 배지는 `bg-destructive`)으로 옮겼다.
- **채널 히어로 크롬과 채널 그리드의 재생 글리프도 같은 면제를 받는다** (2026-09-11, 설계 `docs/superpowers/specs/2026-09-11-channel-home-redesign-design.md`). 채널 홈(`/channel/[slug]`) 상단 히어로는 관리자가 넣은 커버 사진(없으면 아바타 블러)이 깔리므로 밑이 임의의 콘텐츠 픽셀이다 — 그 위의 뒤로가기(`bg-black/50` 원, 음소거 버튼과 같은 외피)·채널명·장르 칩·게시물 수·소개·두 칸 액션 바(`border-white/40 bg-black/30`)는 흰색 고정이고, 하단 60%에 검정 0.7 → 투명 단조 감소 스크림이 대비를 만든다. 이미지가 없거나 깨져도 맨 밑에 `--post-navy` 바탕이 있어 대비가 유지된다. 그리드의 정방형 타일은 카드 배경·영상 포스터 위이므로 영상 타일 우상단 재생 글리프(`bg-black/50` 원 + 흰 아이콘)도 면제다. 타일의 훅 문구는 면제가 아니라 콘텐츠 잉크(`--post-ink-light|dark`, 게시글 배경 절)를 쓴다. 범위는 `apps/client/src/components/channel/` 안으로 한정하고, 그 아래 게시물 상세의 뒤로가기 헤더는 `background` 표면 위라 시맨틱 토큰을 쓴다.
- **외부 브랜드 자산**도 예외다. 소셜로그인 버튼의 카카오 노란색(`#FEE500`)처럼 제공사가 색을 규정한 경우는 원시 값을 쓴다 — 토큰으로 바꾸면 브랜드 가이드 위반이다. 이 예외는 `components/auth/` 안에만 둔다.
- 상태를 색으로만 말하지 않는다. 좋아요한 하트는 빨강이 아니라 **채움**으로 구분한다 — 유채색은 도서 표지의 몫이고, 색맹 사용자에게도 형태가 더 확실하다.
- 텍스트 대비: `mutedForeground`가 `background` 위에서 **4.5:1**을 만족하는 하한선이다 (측정값 — 라이트 4.94, 다크 7.66). 이보다 흐린 텍스트를 본문에 쓰지 않는다. 토큰을 조정하면 두 테마 모두 다시 재보아야 한다.

## Typography

- **브랜드 로고**: `BrandLogo`가 더블 t 심볼 + Gasoek One ‘똑똑’ PNG를 원본 비율로 표시한다. 높이는 `h-8`, 라이트는 검정·다크는 흰색이며 앱의 테마 클래스를 따른다. 글꼴은 이미지에 포함되어 별도 로딩하지 않는다. 소개 상·하단, 홈 상단, 관리자 브랜드 위치에서 공유한다. 슬로건·저작권·페이지 제목의 서비스명은 텍스트를 유지한다.
- **파비콘**: 더블 t 심볼 단독. `apps/*/src/app/icon.svg`는 브라우저 색상 설정에 대응하며, `favicon.ico`는 밝은 바탕의 호환용 아이콘이다.

- **본문/UI: Pretendard Variable** (가변 45~920, 자체 호스팅 `apps/*/src/app/fonts/`). `next/font/local`로 `--font-sans`에 바인딩되어 있고 `font-sans`가 기본이다. 앱 화면은 400/500/700만 쓰고, 소개 랜딩(`/about`)은 600을 더 쓴다.
- **모노: Geist Mono** — ISBN, 코드성 메타데이터 전용.
- 스케일은 front matter의 7단계가 전부다. 임의 크기(`text-[13px]`)를 만들지 않는다.
- 본문 최소 크기 14px, 캡션(메타 정보) 최소 12px. 12px 미만 텍스트 금지.
- `quote`는 도서 상세 시트의 인용구 전용 — 크게, 여유 있는 행간(1.7)으로. 인용구는 게시물이 아니라 도서의 메타정보다 (PRD §5.12).
- 줄바꿈 배려: 한국어 제목류에는 `break-keep`을 적용한다. **`overflow-wrap: anywhere` 안전망은 `globals.css`가 `.break-keep`에 함께 걸어 두므로 화면에서 따로 붙이지 않는다** — 띄어쓰기 없는 긴 제목은 어절이 하나뿐이라 끊을 자리가 없어 상자를 뚫고 나가는데(실측 375px: 카드 제목 16px, 카테고리 86px), 안전망은 그런 경우에만 개입하고 평소 줄바꿈 품질은 건드리지 않는다. 짝을 화면마다 손으로 채우게 하면 반드시 어딘가 빠진다(`break-keep`이 이미 57곳).

## Layout

- **모바일 우선, 최대 480px 중앙 프레임** — `(main)` 레이아웃이 강제한다. 새 화면은 이 프레임 안에서 설계한다.
- **프레임 폭은 `--container-frame`(480px) 토큰 하나다** — `max-w-frame`으로 쓰고, 레이아웃과 바텀시트(`ui/drawer.tsx`)가 함께 참조한다. 값을 새로 적어 넣지 않는다: 시트는 `position: fixed`라 제한하지 않으면 폭이 프레임이 아니라 **뷰포트**에 묶이고, 두 값이 갈리는 순간 시트만 프레임 밖으로 삐져나온다(실측 재현). 오버레이는 예외로 뷰포트 전체를 덮는다 — 프레임 밖을 눌러도 닫혀야 한다.
- 간격은 4px 배수 스케일(front matter `spacing`)만 사용. 화면 기본 패딩 `md`(16px), 섹션 간 `lg`(24px).
- **셸 높이**: `(main)` 레이아웃이 `h-dvh` 고정 + `main`에 `min-h-0`을 준다. 각 화면은 `h-full`로 채우고 필요하면 스스로 스크롤한다 — 피드가 자기 높이를 정확히 알아야 스냅이 성립하기 때문이다.
- **피드는 예외 레이아웃**: 셸 높이(= `100dvh` − BottomNav)를 채우는 자체 스크롤 컨테이너, 패딩 없는 풀블리드. **스냅은 전면 피드(릴스·게시물 상세)만** 건다 — 한 화면에 게시물 하나이기 때문이다. **홈 카드 목록은 proximity 스냅이다** — 카드가 목록 높이의 85%를 하한으로 받으면서(아래 카드 높이 불릿) 한 화면에 한 장이 되어, "여러 장이 이어지는 보통의 목록"이라는 예전 전제가 사라졌다. 릴스의 mandatory와 갈리는 이유는 하한을 넘긴 카드가 스크롤 영역보다 클 수 있어서다(320×568에서 ~600px > 455px) — mandatory면 그 아래쪽을 보려 할 때 스크롤이 끌려간다. 센티널·로딩 푸터에는 `snap-start`를 주지 않는다. safe-area는 `env(safe-area-inset-*)`로 처리 (BottomNav에 적용된 패턴을 따를 것). **홈은 그 앞에 구조적 헤더(`TopBar`, 56px)가 하나 더 있다** — 오버레이가 아니라 목록의 flex 형제라 스크롤에서 빠지고 셸 높이를 그만큼 나눠 갖는다(`page.tsx`가 컬럼, `CardFeed`가 `flex-1 min-h-0`). 릴스는 전면 피드라 이 헤더가 없다(결정 기록 §11-53).
- **카드 높이는 기기에 맞춘 하한이다(홈 전용)**: 카드 래퍼가 스크롤 컨테이너의 `min(85%, 720px)`을 **`min-height`로** 받는다 (`card-metrics.ts`의 `CARD_SCROLL_ITEM`). 기준을 `dvh`가 아니라 컨테이너 퍼센트로 두는 이유는 그 컨테이너가 이미 상단바(56)·GNB(57)를 뺀 높이여서 두 값을 두 번 적지 않아도 되기 때문이다 — `--container-frame`과 같은 원칙. 85%는 다음 카드가 105px 걸치게 해(812px 폰 기준) "아래에 더 있다"를 보이려는 값이고, 720px는 1080p PC에서 480px 폭 카드가 807px 기둥이 되는 것을 막는 **하한의 정지점**이다(잘라내는 상한이 아니다). **`height`·`max-height`·`aspect-*`를 카드 높이에 걸지 말 것** — §11-54가 기록한 실패(넘침이 표지 압축 216→175px으로 조용히 흡수됨)가 그대로 돌아온다. 같은 이유로 `shrink-0`이 필수다: 빼면 flex가 카드를 컨테이너에 맞춰 눌러 하한이 상한처럼 작동한다(실측: 521px 카드가 516px로 눌림).
- **피드 세이프존(전면 피드 전용 — 릴스·게시물 상세)**: 크롬이 컨텐츠 위에 얹히므로 카드 본문이 스스로 피한다 — 상단 20px(피할 크롬이 없는 순수 시각 여백), 좌우 각 60px(레일 우측 여백 8 + 레일 폭 44 + 여유 8), 하단 96px(바 하단 여백 12 + 도서 정보 바 76 + 여유 8). **좌우는 반드시 대칭**이라야 중앙정렬 콘텐츠가 프레임 중심에서 밀리지 않는다 — 그 대가로 좌측 정렬 변형(`regions.tsx`의 `genre.b`·`biblio.b`·`hook.b`·`desc.b`)도 왼쪽에 필요 없는 60px를 그대로 진다. 대칭의 근거는 중앙정렬 사례만 설명하지만, 두 변형이 같은 패딩을 공유하므로 값 자체는 갈라놓지 않는다. 상단만 산식이 없다 — 한때 64px(상단 바 56 + 여유 8)이었는데 그건 홈이 전면 피드이던 시절 상단 오버레이 바(§11-47)를 피하려던 값이고, 홈이 카드 피드가 되며 그 바가 구조적 헤더로 옮겨가(§11-53) 이 상수를 쓰는 화면에는 피할 상단 바가 남지 않아 20px으로 되돌렸다(§11-57).
- **카드 본문(홈 전용)**: 중앙은 관리자 문구와 배경으로 구성한다. 표지·도서명·저자명은 하단 도서 바에서만 보여준다. 좌우 24px, 상하 40px, 영역 간 24px이며 핵심 문장은 24px 굵은 글씨다. 내용에 따라 늘어나는 높이와 기존 카드 최소 높이는 유지한다. 배경의 이미지는 절대 배치하고 텍스트는 일반 흐름에 둬 잘리지 않게 한다. 목록은 풀블리드와 하단 경계선을 유지한다.
- **z 스케일**: 본문 z-auto(기본 층) → 스크림 2 → 크롬 3 → `BottomNav` 50 → 시트·모달(Radix portal). 새 오버레이는 이 스케일 안에 배치한다. **본문에 `z-0`을 주지 말 것** — `position: absolute` + `z-index: auto`는 스태킹 컨텍스트를 만들지 않지만 `z-0`은 만든다. 붙이면 `VideoPlayer`의 음소거 버튼(`z-[3]`)이 그 컨텍스트에 갇혀 스크림·크롬 아래로 가려진다.
- 터치 타깃 최소 44×44px, 인접 타깃 간 8px 이상.
  - **예외는 `BottomNav` 하나다.** 폭을 균등 분할하는 탭 바는 칸이 서로 붙어 있고, 이건 모바일 OS의 탭 바가 전부 그렇다 — 8px를 넣으면 오히려 낯설어진다. 8px 규칙은 작은 버튼들이 나란히 놓일 때 오터치를 막으려는 것인데, 탭 하나가 375px에서 93×56px(4탭 기준)이라 그 위험이 다르다. **이 예외를 다른 곳으로 넓히지 말 것** — 레일·액션 줄·세그먼트 토글에는 그대로 8px가 적용된다.
- 가로 스크롤은 카드 캐러셀 내부에만 존재한다. 페이지 레벨 가로 스크롤 금지.

## Elevation & Depth

그림자를 쓰지 않는다. 깊이는 **표면 밝기 단차 + 경계선**으로 표현한다:

> 예외: 피드 크롬의 **콘텐츠 위 가독성** 확보에 한해 그림자를 쓴다. 깊이 표현이 아니라 밝은 카드 위에서 흰 글리프의 경계를 세우는 용도다. 유틸은 `globals.css`의 `.feed-chrome-icon` / `.feed-chrome-text`, 그리고 `chrome.ts`의 `CHROME_CTA_ICON`이 쓰는 CTA 링(`shadow-[0_0_0_1px_rgb(0_0_0/0.22),0_1px_2px_rgb(0_0_0/0.2)]`) 세 개뿐이고, 그 밖의 그림자는 여전히 금지다.

1. `background` (가장 깊음) → 2. `card` (+1단계) → 3. 오버레이/시트 (`card` + `border`)

두 테마 모두 **`card`가 `background`보다 밝다**. 그래서 라이트에서 바탕은 순백이 아니라 살짝 낮은 회백(`oklch(0.98)`)이고 카드가 순백이다 — 둘 다 순백이면 단차가 0이 되어 이 규칙이 무너진다.
- 모달·드로어의 배경 딤은 `bg-black/60`.
- 플로팅 요소(BottomNav 등)는 `backdrop-blur` + 반투명 배경으로 콘텐츠 위에 뜬다.

## Shapes

- 기본 라운딩: 카드·시트 `lg`(10px), 버튼·입력 `md`(8px), 칩·뱃지 `full`.
- 아바타는 원형(`full`). 도서 커버는 실물 은유를 위해 `sm`(6px)로 각을 살린다.
- 라운딩 값은 `--radius` 파생 토큰(`rounded-sm`~`rounded-xl`)만 사용. 임의 값 금지.

## Components

- **3D 도서 표지 편집기**: 관리자 도서 폼의 표지 영역 안에서 연다. 미리보기는 2:3 비율, 모바일에서는 조작부 위에 놓고 넓은 화면에서는 나란히 배치한다. 적용 버튼은 secondary, 도서 전체 저장만 primary다. 캔버스는 제작물이며 출력 좌표·글자 크기·책 치수는 800×1200 이미지 기준을 사용한다. UI의 임의 크기 예외로 확대하지 않는다. 제작물 팔레트는 `theme.css`의 `--book-cover-{forest,navy,wine}-{base,ink,accent}`와 `--book-cover-paper`, `--book-cover-light-{sky,ground,key,rim,bounce}`, 이미지 템플릿의 글자색 `--book-cover-image-ink-{light,dark}`에 모은다. **이미지 템플릿**은 관리자가 앞표지(필수)·책등·뒷표지 원본을 면별로 올리고, 팔레트 선택 대신 판·책등판·둥근 모서리·머리띠·빈 면의 색을 **앞표지 이미지의 바깥 테두리 평균색**에서 파생한다 — 이음새가 이미지와 같은 값에서 나오게 하려는 것이며, 이 파생 색은 콘텐츠 데이터라 시맨틱 토큰이 아니다(편집기의 색 견본이 그 값을 인라인으로 그리는 것은 팔레트 견본과 같은 예외). 이미지는 그림면 비율로 중앙을 잘라 채우고 글자·질감을 얹지 않는다. 책은 참고 작품 Complete Shelf의 둥근 양장본 비율(약 131×220mm), 약 3.4mm 표지판, 따뜻한 종이와 낮은 광택을 따른다. 기본 전체 두께는 27mm다. 앞뒤 표지와 책등은 같은 팔레트를 사용한다. 마우스·터치 드래그와 방향키로 좌우 360° 회전하고 위아래 ±90° 기울인다. 앞표지·책등·뒷표지·종이 면 버튼과 슬라이더를 대체 조작으로 제공한다. 선택한 방향은 이미지와 함께 저장하고 어떤 방향에서도 책 전체가 프레임 안에 들어오게 한다. 제작물은 앱 테마에 따라 변색되지 않는다. 조작부에는 기존 시맨틱 토큰만 사용한다. 3D 조명은 책 소재 표현에만 적용하며 화면 컨테이너 그림자는 만들지 않는다.

- **shadcn/ui가 컴포넌트 기반**이다 (radix base, nova preset). `packages/ui/src/components/`의 변형을 우선 사용하고, 없으면 shadcn 레지스트리에서 추가한다.
- 버튼 위계: 화면당 `primary` 버튼은 **하나**("바로 읽기" 등 핵심 전환). 나머지는 `secondary`/`ghost`.
- 모바일 인터랙션 표면은 Dialog가 아니라 **Drawer(바텀시트)** 가 기본이다: 댓글, 도서 상세(더보기), 로그인 유도.
- 기본 아이콘은 lucide-react를 쓴다. 읽기·바로 읽기에는 사용자 지정 플랫 책 아이콘을 사용한다. 하단 메뉴는 이름을 화면에 표시하지 않고 24px 아이콘만 표시하며, 비활성은 윤곽선·활성은 같은 의미의 단색 채움 아이콘으로 구분한다. 메뉴 이름은 `aria-label`, 현재 메뉴는 `aria-current="page"`로 전달한다. 하단 메뉴의 기존 높이와 터치 영역은 유지한다. 이모지를 아이콘으로 쓰지 않는다.
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
  - **예외: 소개 랜딩(`/about`)** — 참고 사이트를 복제하라는 요구(PRD §11-67)로 회전 강조어·마퀴·쉐브론 펄스·스토리 진행 막대를 돈다. 토큰은 `globals.css` `@theme`의 `--animate-*` 소개 전용 블록 하나에 모여 있고, 쓰는 쪽은 전부 `motion-safe:` 변형이라 감속 설정에서는 멈춰 있다. 아코디언의 250ms 높이 전이(`.details-animate`)도 같은 예외다. 앱 화면으로 가져오지 않는다.

## 게시글 배경 (2026-09-11)

- 관리자가 게시글별로 단색 또는 이미지를 선택한다. 채널 헤더·하단 도서 정보·액션 줄은 배경 적용에서 제외한다.
- 기본은 종이색(--post-paper), 추천색은 살구(--post-peach), 연보라(--post-lavender), 숲(--post-forest), 밤(--post-navy). 값은 theme.css가 원천이다.
- 직접 선택한 6자리 HEX는 콘텐츠 데이터로 저장하는 예외다. 관리자의 색상 입력에만 허용하며 일반 UI에 원시 색을 추가하지 않는다.
- 글자색은 --post-ink-light / --post-ink-dark. 설명도 같은 잉크색을 사용해 이미지 위의 대비를 유지한다. 이미지 어둡기는 --post-dim의 불투명도(0~100%)이며 가로·세로 위치도 각각 0~100%로 저장한다.
- 기존 배경 NULL은 기본 단색으로 표시한다. 관리자 미리보기는 375×812 모바일이며 실제 홈과 같은 화면 조각을 공유한다.
