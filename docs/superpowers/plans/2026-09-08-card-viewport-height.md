# 홈 카드 높이 — 기기 높이 기준 하한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 카드가 기기 높이에 맞춰 커지도록, 스크롤 컨테이너의 `min(85%, 720px)`을 카드 높이의 **하한**으로 건다.

**Architecture:** 높이는 스크롤 아이템(카드 래퍼)이 `min-height`로 받아 `article` → 본문 상자로 `grow` 전달하고, 크롬 163px는 고정인 채 본문만 늘어난다. 값은 `card-metrics.ts` 상수 하나에 두고 실제 홈(`card-feed.tsx`)과 어드민 미리보기(`post-preview.tsx`)가 함께 import한다.

**Tech Stack:** Next.js 16 (App Router) · Tailwind v4 · TypeScript. 새 의존성 없음.

## Global Constraints

- 설계 원본: `docs/superpowers/specs/2026-09-08-card-viewport-height-design.md`. 값이 어긋나면 스펙이 이긴다.
- 스타일은 **시맨틱 토큰과 Tailwind 유틸리티만**. 원시 hex·px·Tailwind 팔레트 직접 참조 금지 (DESIGN.md).
- **`min-height`만 쓴다. `height`·`max-height`·`aspect-*`·`overflow-hidden`을 카드 높이에 걸지 않는다** — PRD §11-54의 실패(넘침이 표지 압축으로 조용히 흡수됨)가 그대로 재발한다.
- 규칙을 바꾼 태스크는 해당 가이드 문서를 **같은 커밋에서** 갱신한다 (AGENTS.md 완료 기준).
- **릴스(`post-item.tsx`)·`CHROME_SAFE_AREA`·`registry.ts`의 표지 크기는 건드리지 않는다.** 표지는 카드 모드에서 `compact`(w-24) 그대로다 — 큰 표지로 바꾸면 긴 카드가 672px까지 늘어 peek이 사라진다.
- **행 번호는 변경 전 트리 기준이다.** 앞 태스크가 줄 수를 바꾸므로, 각 스텝에서 **인용한 기존 코드가 진짜 앵커**다. 행 번호가 안 맞으면 인용문으로 찾는다.

## 테스트 전략 — 이 계획에 vitest 태스크가 없는 이유

FRONTEND.md §7이 테스트 경계를 명시한다: **"순수 함수만 대상이다… 네트워크 경로와 렌더는 `npm run build` + 375px 확인이 맡는다."**

이 변경에는 순수 함수가 없다 — 전부 레이아웃 클래스다. 그래서 각 태스크의 red/green 사이클은 **브라우저 실측**이고, 그게 이 저장소가 지정한 검증 경로다. 레이아웃을 jsdom에서 단위 테스트로 감싸면 jsdom이 레이아웃을 계산하지 않으므로 통과해도 아무것도 증명하지 못한다.

`npm test`(기존 121개)는 회귀 확인용으로 매 태스크에서 돌린다.

### 공용 계측 스니펫 (`MEASURE`)

아래 태스크에서 `MEASURE 실행`이라고 하면 **이 스니펫**을 `mcp__Claude_Browser__javascript_tool`로 실행한다는 뜻이다.

```js
const wraps = [...document.querySelectorAll('[data-post-id]')];
const sc = wraps[0].parentElement;
const H = sc.getBoundingClientRect().height;
const covers = [...document.querySelectorAll('[data-card-body] div')]
  .filter(d => typeof d.className === 'string' && d.className.includes('aspect-[2/3]'));
({
  scrollerH: Math.round(H),
  target: Math.round(Math.min(H * 0.85, 720)),
  cardHeights: wraps.map(w => Math.round(w.getBoundingClientRect().height)),
  // 래퍼와 article의 높이 차 — 0이 아니면 grow 체인이 끊긴 것이다
  articleGaps: wraps.map(w => Math.round(
    w.getBoundingClientRect().height - w.querySelector('article').getBoundingClientRect().height)),
  // 2:3 = 0.667. 이 값이 흔들리면 어딘가에서 높이가 다시 제약되고 있다
  coverRatios: covers.map(c => {
    const r = c.getBoundingClientRect();
    return +(r.width / r.height).toFixed(3);
  }),
  snapType: getComputedStyle(sc).scrollSnapType,
  snapAlign: getComputedStyle(wraps[0]).scrollSnapAlign,
  minHeightResolved: getComputedStyle(wraps[0]).minHeight,
})
```

**`coverRatios`가 이 계획의 카나리아다.** PRD §11-54가 남긴 교훈: 넘침은 오버플로 수치로 안 잡히고 표지 찌그러짐으로만 드러난다. 0.667이 아니면 멈추고 원인을 찾는다.

### 브라우저 준비 (모든 태스크 공통)

```
mcp__Claude_Browser__preview_start  {"url": "http://localhost:3001"}
```

dev 서버는 이미 3001에 떠 있다. **포트 3001이 물려 있어도 죽이지 말 것** — 부모 저장소의 서버다.

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `src/components/feed/card-metrics.ts` | **신규.** 카드가 스크롤 컨테이너에서 차지하는 크기 — 상수 하나 + 근거 | 1, 2 |
| `src/components/feed/card-feed.tsx` | 홈 목록. 래퍼에 상수 적용, 컨테이너에 스냅 | 1, 2 |
| `src/components/feed/post-card.tsx` | 카드 한 장. 래퍼 높이를 본문까지 전달(`grow` 체인) | 1 |
| `src/components/admin/post-preview.tsx` | 어드민 미리보기. 홈과 같은 프레임·같은 상수 | 3 |
| `docs/DESIGN.md` | Layout 절 — 높이 하한 규칙(T1), 스냅 규칙 반전(T2) | 1, 2 |
| `docs/prd-ttokttok.md` | §11 결정 기록 62번 | 4 |

---

## Task 1: 카드 높이 하한

카드가 스크롤 컨테이너의 `min(85%, 720px)`까지 커지고, 그 높이가 본문 상자까지 전달된다. 스냅은 아직 없다.

**Files:**
- Create: `src/components/feed/card-metrics.ts`
- Modify: `src/components/feed/card-feed.tsx` (import 추가, 267행 래퍼 `<div>`)
- Modify: `src/components/feed/post-card.tsx` (47행 `<article>`, 76행 본문 `<div>`)
- Modify: `docs/DESIGN.md` (Layout 절, 153행 뒤)

**Interfaces:**
- Produces: `CARD_SCROLL_ITEM: string` — `src/components/feed/card-metrics.ts`의 named export. Tailwind 클래스 문자열. Task 2가 이 상수에 `snap-start`를 더하고, Task 3이 그대로 import한다.

- [ ] **Step 1: 현재 상태를 계측해 실패를 확인한다**

브라우저를 열고 375×812로 맞춘 뒤 MEASURE 실행:

```
mcp__Claude_Browser__preview_start   {"url": "http://localhost:3001"}
mcp__Claude_Browser__resize_window   {"preset": "mobile", "tabId": "seed"}
```

Expected (실패 상태): `cardHeights`가 `target`(≈594)보다 작고 제각각 — 354~521 범위. `minHeightResolved`는 `0px` 또는 `auto`.

- [ ] **Step 2: 상수 파일을 만든다**

Create `src/components/feed/card-metrics.ts`:

```ts
/**
 * 홈 카드가 스크롤 컨테이너 안에서 차지하는 크기.
 * 설계: docs/superpowers/specs/2026-09-08-card-viewport-height-design.md
 *
 * `card-feed.tsx`(실제 홈)와 `post-preview.tsx`(어드민 미리보기)가 함께
 * 쓴다. 두 곳에 문자열을 적으면 한쪽만 바뀌는 순간 미리보기가 실제 홈과
 * 다른 높이를 보여주는데, 그게 PRD §5.10이 막으려던 실패다 — 편집기에서
 * 통과시킨 문구가 홈에서는 넘친다. `chrome.ts`가 CHROME_SAFE_AREA를
 * 여러 화면에 나눠 주는 것과 같은 패턴이다.
 */

/**
 * 카드 한 장을 감싸는 스크롤 아이템.
 *
 * **`min-h`이지 `h`가 아니다.** 상한을 두면 PRD §11-54의 실패가 그대로
 * 돌아온다 — 내용이 넘칠 때 글자가 잘리는 대신 flex가 `BookCover`를 눌러
 * 흡수하고(216→175px, 2:3이 0.82:1로 찌그러진다) 오버플로 수치는 0으로
 * 나와 눈에 띄지 않는다. 하한만 정하면 긴 카드는 스스로 길어지고 눌릴
 * 것이 없다.
 *
 * **퍼센트의 기준은 스크롤 컨테이너다 — `dvh`가 아니다.** 그 컨테이너는
 * 이미 상단바(56)와 GNB(57)를 뺀 높이라, 퍼센트로 쓰면 두 값을 여기에
 * 다시 적지 않는다. `calc(100dvh - 56px - 57px)`로 쓰면 그 식이 두 번째
 * 진실이 되고, 상단바 높이를 바꾸는 사람이 이 파일을 알 방법이 없다
 * (`--container-frame`을 토큰 하나로 묶어 둔 이유와 같다 — DESIGN.md Layout).
 *
 * **85%인 이유는 peek이다.** 812px 폰에서 카드 594px, 다음 카드가 105px
 * 걸친다 — 아래에 더 있다는 유일한 신호다. 100%면 카드가 화면과 정확히
 * 같아져 스크롤할 것이 남았는지 알 수 없다.
 *
 * **720px는 하한이 멈추는 지점이지 상한이 아니다.** 없으면 1080p PC
 * (스크롤 영역 ~950px)에서 하한이 807px가 되는데, 프레임 폭은 480px
 * 고정이라 96px 표지 하나가 떠 있는 홀쭉한 기둥이 된다. 카드는 여전히
 * 내용에 따라 720px를 넘을 수 있다.
 *
 * **`shrink-0`은 장식이 아니라 §11-54 방지 장치의 나머지 절반이다.**
 * 실측(607px 컨테이너, 하한 516px): 빼면 자연 높이 521px짜리 카드가
 * 516px로 눌렸다 — flex 컬럼의 `flex-shrink: 1`(기본값)이 항목을
 * 컨테이너에 맞추려 들어 `min-h`가 상한처럼 작동한다. 같은 함정이
 * `card-feed.tsx`의 센티널 주석에도 적혀 있다.
 *
 * `flex flex-col`은 이 높이를 자식(`article`)에게 넘기기 위한 것이다 —
 * 없으면 래퍼만 커지고 카드는 그대로라 아래에 빈 띠가 남는다(실측 18px,
 * 카드가 짧을수록 커진다).
 */
export const CARD_SCROLL_ITEM = "flex min-h-[min(85%,720px)] shrink-0 flex-col";
```

- [ ] **Step 3: `card-feed.tsx`의 래퍼에 적용한다**

`src/components/feed/card-feed.tsx` — import 블록(9행 `loadMoreCards` import 아래)에 추가:

```ts
import { CARD_SCROLL_ITEM } from "@/components/feed/card-metrics";
```

267행 래퍼를 바꾼다.

기존:

```tsx
      {nodes.map((node, i) => (
        <div key={postIds[i] ?? i} data-post-id={postIds[i]}>
          {node}
        </div>
      ))}
```

변경 후:

```tsx
      {nodes.map((node, i) => (
        <div
          key={postIds[i] ?? i}
          data-post-id={postIds[i]}
          className={CARD_SCROLL_ITEM}
        >
          {node}
        </div>
      ))}
```

- [ ] **Step 4: `post-card.tsx`에 grow 체인을 잇는다**

47행 `<article>` — 기존:

```tsx
    <article className="border-border bg-card overflow-hidden border-b">
```

변경 후 (`flex grow flex-col` 추가):

```tsx
    <article className="border-border bg-card flex grow flex-col overflow-hidden border-b">
```

76행 본문 상자 — 기존:

```tsx
      <div data-card-body>
```

변경 후:

```tsx
      <div data-card-body className="grow">
```

이 두 줄이 "래퍼가 받은 높이 → article → 본문 상자"의 체인이다. 크롬(채널 헤더·액션 줄·도서 바)은 `grow`가 없으므로 163px 그대로 있고, 남는 공간은 전부 본문 상자로 간다. `TemplateCard`는 이미 `h-full … justify-center`라 콘텐츠가 가운데로 모인다 — **`template-card.tsx`는 건드리지 않는다.**

- [ ] **Step 5: 계측해서 통과를 확인한다 (375×812)**

MEASURE 실행. Expected:

| 키 | 기대값 |
|---|---|
| `scrollerH` | 699 |
| `target` | 594 |
| `cardHeights` | 전부 594 (내용이 긴 카드만 594 초과) |
| `articleGaps` | **전부 0** |
| `coverRatios` | **전부 0.667** |
| `minHeightResolved` | `594px` (Tailwind 임의값이 컴파일됐다는 뜻) |

`minHeightResolved`가 `0px`이면 Tailwind가 클래스를 못 만든 것이다 — 클래스 문자열의 오타를 먼저 의심한다.

- [ ] **Step 6: 짧은 기기에서 하한을 넘는 경로를 확인한다 (320×568)**

```
mcp__Claude_Browser__resize_window  {"width": 320, "height": 568, "tabId": "seed"}
```

MEASURE 실행. Expected: `target`은 ≈387인데 `cardHeights`는 그보다 **크다**(내용이 더 필요해서). `coverRatios`는 여전히 **전부 0.667**, `articleGaps`는 전부 0.

이게 `min-height`가 상한이 아님을 증명하는 단계다. 여기서 표지 비율이 깨지면 어딘가에 높이 상한이 남아 있는 것이다.

- [ ] **Step 7: PC 상한을 확인한다 (1200×1080)**

```
mcp__Claude_Browser__resize_window  {"width": 1200, "height": 1080, "tabId": "seed"}
```

MEASURE 실행. Expected: `scrollerH` ≈ 967, `target` **720**(85%가 아니라 상한이 물림), `cardHeights` 전부 720, `coverRatios` 전부 0.667.

끝나면 뷰포트를 되돌린다: `resize_window {"preset": "desktop", "tabId": "seed"}`

- [ ] **Step 8: DESIGN.md Layout 절을 갱신한다**

`docs/DESIGN.md` 153행 바로 아래에 새 불릿을 추가한다:

```markdown
- **카드 높이는 기기에 맞춘 하한이다(홈 전용)**: 카드 래퍼가 스크롤 컨테이너의 `min(85%, 720px)`을 **`min-height`로** 받는다 (`card-metrics.ts`의 `CARD_SCROLL_ITEM`). 기준을 `dvh`가 아니라 컨테이너 퍼센트로 두는 이유는 그 컨테이너가 이미 상단바(56)·GNB(57)를 뺀 높이여서 두 값을 두 번 적지 않아도 되기 때문이다 — `--container-frame`과 같은 원칙. 85%는 다음 카드가 105px 걸치게 해(812px 폰 기준) "아래에 더 있다"를 보이려는 값이고, 720px는 1080p PC에서 480px 폭 카드가 807px 기둥이 되는 것을 막는 **하한의 정지점**이다(잘라내는 상한이 아니다). **`height`·`max-height`·`aspect-*`를 카드 높이에 걸지 말 것** — §11-54가 기록한 실패(넘침이 표지 압축 216→175px으로 조용히 흡수됨)가 그대로 돌아온다. 같은 이유로 `shrink-0`이 필수다: 빼면 flex가 카드를 컨테이너에 맞춰 눌러 하한이 상한처럼 작동한다(실측: 521px 카드가 516px로 눌림).
```

- [ ] **Step 9: 빌드·테스트**

```bash
npm run build && npm test
```

Expected: 빌드 통과(타입체크 포함), 테스트 121개 통과.

- [ ] **Step 10: 커밋**

```bash
git add src/components/feed/card-metrics.ts src/components/feed/card-feed.tsx src/components/feed/post-card.tsx docs/DESIGN.md
git commit -m "feat(feed): 홈 카드 높이를 스크롤 컨테이너 기준 하한으로

카드가 354~521px로 제각각이라 607px 목록의 40%가 남던 문제.
min(85%, 720px)을 min-height로 걸어 기기 높이에 맞춰 커지게 한다.

height가 아닌 이유는 PRD §11-54 — 넘침이 표지 압축으로 조용히
흡수된다. shrink-0이 없으면 flex가 같은 압축을 다시 만든다(실측:
521px 카드가 516px로 눌림).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 스크롤 스냅

카드 위끝이 목록 상단에 붙는다. 카드가 화면 하나를 거의 채우게 된 뒤라야 의미가 있으므로 Task 1 다음이다.

**Files:**
- Modify: `src/components/feed/card-metrics.ts` (`CARD_SCROLL_ITEM`에 `snap-start`)
- Modify: `src/components/feed/card-feed.tsx` (264행 컨테이너)
- Modify: `docs/DESIGN.md` (153행 — 스냅 규칙 반전)

**Interfaces:**
- Consumes: Task 1의 `CARD_SCROLL_ITEM`.
- Produces: 없음 (같은 상수를 확장할 뿐, 이름·타입 불변).

- [ ] **Step 1: 현재 스냅이 꺼져 있음을 확인한다**

375×812로 맞추고 MEASURE 실행. Expected: `snapType`이 `none`, `snapAlign`이 `none`.

- [ ] **Step 2: 상수에 `snap-start`를 더한다**

`src/components/feed/card-metrics.ts` 맨 아래 export를 바꾼다.

기존:

```ts
export const CARD_SCROLL_ITEM = "flex min-h-[min(85%,720px)] shrink-0 flex-col";
```

변경 후:

```ts
export const CARD_SCROLL_ITEM =
  "flex min-h-[min(85%,720px)] shrink-0 snap-start flex-col";
```

그리고 위 JSDoc 블록의 마지막 문단(`flex flex-col`을 설명하는 문단) 뒤에 한 문단을 덧붙인다:

```
 * `snap-start`는 카드 위끝을 목록 상단에 붙인다. 컨테이너 쪽 짝은
 * `card-feed.tsx`의 `snap-y snap-proximity`다. 어드민 미리보기는 카드가
 * 한 장뿐이라 스냅이 무의미하지만 상수를 갈라놓지 않는다 — 미리보기용
 * 변형을 만드는 순간 "닮았지만 다른" 두 번째 규칙이 생기고, 그게 이
 * 파일이 존재하는 이유를 무너뜨린다. 무해한 클래스 하나가 낫다.
```

- [ ] **Step 3: 컨테이너에 `snap-y snap-proximity`를 건다**

`src/components/feed/card-feed.tsx` 264행 — 기존:

```tsx
      className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```

변경 후:

```tsx
      className="flex min-h-0 flex-1 snap-y snap-proximity flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```

그리고 그 위 주석 블록(스크롤바 숨김 설명이 끝나는 곳, 261행 뒤)에 근거를 덧붙인다:

```
    //
    // snap-proximity이지 mandatory가 아니다 — 하한(card-metrics.ts)을 넘긴
    // 카드는 스크롤 영역보다 클 수 있다(320×568에서 카드 ~600px > 영역
    // 455px). mandatory면 그 카드의 아래쪽을 보려 할 때마다 스크롤이 다음
    // 스냅 지점으로 끌려가 사용자와 싸운다. 릴스(전면 피드)가 mandatory인
    // 것과 갈리는 지점이다: 거기는 한 화면에 정확히 하나라 넘칠 카드가
    // 없다. 센티널과 로딩·에러 푸터에는 snap-start를 주지 않는다 —
    // 스냅 대상이 되면 목록 끝에서 빈 곳에 멈춘다.
```

- [ ] **Step 4: 계측으로 스냅이 켜졌는지 확인한다**

375×812에서 MEASURE 실행. Expected: `snapType`이 `y proximity`, `snapAlign`이 `start`. `cardHeights`·`coverRatios`는 Task 1 결과에서 변하지 않아야 한다(594 / 0.667).

- [ ] **Step 5: 실제 스크롤이 붙는지 눈으로 확인한다**

**보이는 브라우저에서 해야 한다** — FRONTEND.md §6대로 숨은 뷰에서는 스크롤 이벤트가 오지 않는다.

```
mcp__Claude_Browser__computer  {"action":"scroll","coordinate":[187,400],"scroll_direction":"down","scroll_amount":3,"tabId":"seed"}
mcp__Claude_Browser__computer  {"action":"screenshot","tabId":"seed"}
```

Expected: 스크롤이 멈춘 뒤 카드 하나의 위끝이 목록 상단(상단바 바로 아래)에 맞고, 다음 카드가 아래에 걸쳐 보인다. 센티널·푸터에서 멈추지 않는다.

- [ ] **Step 6: DESIGN.md의 스냅 규칙을 뒤집는다**

`docs/DESIGN.md` 153행 안의 이 문장을 찾는다:

```
**홈 카드 목록은 스냅을 걸지 않는다** — 여러 장이 이어지는 보통의 세로 스크롤 목록이다.
```

이렇게 바꾼다:

```
**홈 카드 목록은 proximity 스냅이다** — 카드가 목록 높이의 85%를 하한으로 받으면서(아래 카드 높이 불릿) 한 화면에 한 장이 되어, "여러 장이 이어지는 보통의 목록"이라는 예전 전제가 사라졌다. 릴스의 mandatory와 갈리는 이유는 하한을 넘긴 카드가 스크롤 영역보다 클 수 있어서다(320×568에서 ~600px > 455px) — mandatory면 그 아래쪽을 보려 할 때 스크롤이 끌려간다. 센티널·로딩 푸터에는 `snap-start`를 주지 않는다.
```

- [ ] **Step 7: 빌드·테스트**

```bash
npm run build && npm test
```

Expected: 빌드 통과, 테스트 121개 통과.

- [ ] **Step 8: 커밋**

```bash
git add src/components/feed/card-metrics.ts src/components/feed/card-feed.tsx docs/DESIGN.md
git commit -m "feat(feed): 홈 카드 목록에 proximity 스냅

카드가 화면 하나를 거의 채우게 되면서 스크롤을 멈출 때마다 카드가
위아래로 반씩 잘리던 것을 스냅으로 잡는다.

mandatory가 아닌 이유: 하한을 넘긴 카드는 스크롤 영역보다 클 수
있어(320x568에서 ~600px > 455px) mandatory면 아래쪽을 볼 때 스크롤이
끌려간다. DESIGN.md의 반대 규칙을 같은 커밋에서 뒤집는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 어드민 미리보기를 홈과 맞춘다

미리보기 프레임에 상단바가 없어 스크롤 영역이 755px(홈은 699px)다. 높이가 의미를 갖게 된 지금 그대로 두면 미리보기 카드는 642px, 홈은 594px로 갈린다.

**Files:**
- Modify: `src/components/admin/post-preview.tsx` (import, 187~193행 렌더 블록)

**Interfaces:**
- Consumes: Task 1·2의 `CARD_SCROLL_ITEM`, 기존 `TopBar`(`@/components/feed/top-bar`, prop `{ isGuest: boolean }`).
- Produces: 없음.

- [ ] **Step 1: 어긋남을 계측으로 확인한다**

```
mcp__Claude_Browser__navigate  {"url":"http://localhost:3001/admin/posts/new","tabId":"seed"}
```

미리보기는 도서를 골라야 뜬다(`bookId`가 비면 "도서를 고르면 미리보기가 나타납니다."). 셀렉트를 찾아 첫 번째 도서를 고른다:

```
mcp__Claude_Browser__read_page  {"filter":"interactive","tabId":"seed"}
```

돌아온 `ref_N` 중 도서 선택 컨트롤에 `form_input`으로 값을 넣는다. 카드 미리보기(`article`)가 화면에 나타난 것을 확인한 뒤 계측한다:

```js
const card = document.querySelector('[data-card-body]').closest('article');
const scroll = card.closest('.overflow-y-auto');
({
  scrollAreaH: Math.round(scroll.getBoundingClientRect().height),
  cardH: Math.round(card.getBoundingClientRect().height),
})
```

Expected (실패 상태): `scrollAreaH`가 **755** — 홈의 699와 다르다. `cardH`는 하한을 못 받아 내용 높이 그대로다.

- [ ] **Step 2: import를 추가한다**

`src/components/admin/post-preview.tsx` — 6행 `BottomNav` import 아래에 두 줄 추가:

```ts
import { TopBar } from "@/components/feed/top-bar";
import { CARD_SCROLL_ITEM } from "@/components/feed/card-metrics";
```

- [ ] **Step 3: 프레임에 TopBar를 넣고 카드를 래퍼로 감싼다**

187~193행 — 기존:

```tsx
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isVideo ? (
          <PostItem post={post} isGuest preview />
        ) : (
          <PostCard post={post} isGuest preview />
        )}
      </div>
```

변경 후:

```tsx
      {/*
        카드 미리보기에만 TopBar를 넣는다 — 실제 홈에는 있고 릴스(전면
        피드)에는 없기 때문이다. 56px 스페이서를 쓰지 않는 이유: TopBar는
        `h-14 shrink-0` 한 줄이라 높이를 베끼면 그게 두 번째 진실이 되고,
        누가 상단바 높이를 바꾸면 미리보기만 조용히 어긋난다. 실물을
        렌더하면 따라온다. isGuest라 UnreadBadge(알림 개수 조회)가 렌더되지
        않으므로 미리보기가 쿼리를 쏘지 않고, 프레임이 inert라 링크도
        눌리지 않는다.

        이 띠가 없으면 스크롤 영역이 755px가 되어 홈(699px)과 갈리고,
        카드 하한이 홈 594 / 미리보기 642로 달라진다 — §5.10이 막으려는
        "편집기에서 통과시킨 문구가 홈에서는 넘친다"가 높이 축에서
        재현되는 것이다.
      */}
      {isVideo ? null : <TopBar isGuest />}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {isVideo ? (
          <PostItem post={post} isGuest preview />
        ) : (
          <div className={CARD_SCROLL_ITEM}>
            <PostCard post={post} isGuest preview />
          </div>
        )}
      </div>
```

스크롤 div에 `flex flex-col`을 더한 이유: 홈의 `CardFeed`와 같은 상자여야 `CARD_SCROLL_ITEM`의 `shrink-0`·`flex-col`이 홈에서와 똑같이 작동한다.

- [ ] **Step 4: 계측해서 홈과 일치하는지 확인한다**

Step 1의 스니펫을 다시 실행. Expected: `scrollAreaH` **699** (홈과 동일), `cardH` **594**.

표지 비율도 확인:

```js
const c = [...document.querySelectorAll('[data-card-body] div')]
  .find(d => typeof d.className === 'string' && d.className.includes('aspect-[2/3]'));
const r = c.getBoundingClientRect();
+(r.width / r.height).toFixed(3)
```

Expected: `0.667`

- [ ] **Step 5: 영상 게시물 분기가 안 깨졌는지 확인한다**

`isVideo` 경로는 375px 전면 프레임이고 TopBar도 카드 래퍼도 받지 않아야 한다. 코드로 확인한다:

```bash
grep -n "isVideo ? null : <TopBar\|CARD_SCROLL_ITEM\|FULLSCREEN_FRAME_WIDTH" src/components/admin/post-preview.tsx
```

Expected: `TopBar`와 `CARD_SCROLL_ITEM` 모두 `isVideo`가 거짓인 가지에만 있다.

- [ ] **Step 6: 빌드·테스트**

```bash
npm run build && npm test
```

Expected: 빌드 통과, 테스트 121개 통과.

- [ ] **Step 7: 커밋**

```bash
git add src/components/admin/post-preview.tsx
git commit -m "fix(admin): 미리보기 프레임을 홈과 같은 높이로 맞춘다

프레임에 상단바가 없어 스크롤 영역이 755px였다 — 홈은 699px.
카드 높이가 의미를 갖게 되면서 미리보기 642 / 홈 594로 갈렸다.

56px 스페이서 대신 TopBar를 실제로 렌더한다: 높이를 베끼면 상단바를
바꾸는 사람이 이 파일을 알 방법이 없다. 카드 래퍼는 홈과 같은
CARD_SCROLL_ITEM을 쓴다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 결정 기록과 최종 확인

**Files:**
- Modify: `docs/prd-ttokttok.md` (§11 결정 기록 표 끝, 621행 60번 아래)

**Interfaces:**
- Consumes: Task 1~3의 결과값(실측 수치).
- Produces: 없음.

- [ ] **Step 1: PRD §11에 62번 항목을 추가한다**

`docs/prd-ttokttok.md`의 결정 기록 표에서 `| 60 | 도서 필드 목록 단일화 |`로 시작하는 행 **바로 아래**에 추가한다 (한 행, 줄바꿈 없이):

```markdown
| 62 | 홈 카드 높이 — 기기 높이 기준 하한 | **카드 높이는 내용이 아니라 기기가 정한다**(2026-09-08). 카드가 354~521px로 제각각이라 607px 목록의 40%가 남고, 표지 유무만으로 167px이 갈렸다. 카드 래퍼(`card-metrics.ts`의 `CARD_SCROLL_ITEM`)가 스크롤 컨테이너의 `min(85%, 720px)`을 **`min-height`로** 받는다. ① `height`가 아닌 이유는 §11-54 그대로다 — 상한을 두면 넘침이 글자 잘림이 아니라 `BookCover` 압축(216→175px, 2:3이 0.82:1)으로 흡수되고 오버플로 수치는 0으로 나와 눈에 안 띈다. 하한만 두면 긴 카드는 스스로 길어진다(320×568 실측: 하한 387px인데 카드 ~600px, 표지 0.667 유지). ② `dvh`가 아니라 컨테이너 퍼센트인 이유는 그 컨테이너가 이미 상단바 56·GNB 57을 뺀 높이여서다 — `calc(100dvh - 56px - 57px)`로 쓰면 그 식이 두 번째 진실이 되고 상단바 높이를 바꾸는 사람이 알 방법이 없다(`--container-frame`과 같은 원칙). ③ 85%는 peek이다 — 812px 폰에서 카드 594px, 다음 카드가 105px 걸쳐 "아래에 더 있다"를 보인다. 100%면 카드가 화면과 같아져 그 신호가 사라진다. ④ 720px는 잘라내는 상한이 아니라 **하한이 멈추는 지점**이다 — 없으면 1080p PC(스크롤 영역 ~950px)에서 하한이 807px가 되는데 폭은 480px 고정이라 96px 표지 하나가 뜬 기둥이 된다. ⑤ **`shrink-0`이 빠지면 이 결정이 스스로를 배신한다** — 실측으로 자연 높이 521px짜리 카드가 하한 516px로 눌렸다. flex 컬럼의 `flex-shrink: 1`이 항목을 컨테이너에 맞추려 들어 `min-h`가 상한처럼 작동한다. ⑥ 한 화면에 한 장이 되면서 DESIGN.md의 "홈은 스냅을 걸지 않는다"가 뒤집혔다 — proximity로 건다(mandatory가 아닌 이유는 ①의 긴 카드가 스크롤 영역보다 커서, 아래쪽을 볼 때 스크롤이 끌려가기 때문). ⑦ 어드민 미리보기는 프레임에 상단바가 없어 스크롤 영역이 755px였다(홈 699). 높이가 의미를 갖는 순간 미리보기 642 / 홈 594로 갈리므로 `TopBar`를 실제로 렌더해 맞췄다 — 56px 스페이서를 쓰지 않은 이유는 값을 베끼면 상단바를 바꾸는 사람이 미리보기를 모르기 때문이다(§11-56·§5.10의 연장). 설계: `docs/superpowers/specs/2026-09-08-card-viewport-height-design.md` |
```

- [ ] **Step 2: 네 뷰포트를 한 번에 훑는다**

각 뷰포트에서 `resize_window` 후 홈(`http://localhost:3001`)에서 MEASURE 실행:

| 뷰포트 | `scrollerH` | `cardHeights` | `coverRatios` | `articleGaps` |
|---|---|---|---|---|
| 375×812 | 699 | 594 (긴 카드만 초과) | 전부 0.667 | 전부 0 |
| 320×568 | 455 | 하한 387 초과 | 전부 0.667 | 전부 0 |
| 1200×1080 | ~967 | 720 | 전부 0.667 | 전부 0 |
| 어드민 미리보기 | 699 | 594 | 0.667 | 0 |

`snapType`은 홈 세 줄에서 `y proximity`, `snapAlign`은 `start`.

하나라도 어긋나면 멈추고 원인을 찾는다 — 특히 `coverRatios`.

- [ ] **Step 3: 뷰포트를 되돌리고 스크린샷을 남긴다**

```
mcp__Claude_Browser__resize_window  {"preset":"mobile","tabId":"seed"}
mcp__Claude_Browser__computer       {"action":"screenshot","tabId":"seed"}
```

- [ ] **Step 4: 빌드·테스트**

```bash
npm run build && npm test
```

Expected: 빌드 통과, 테스트 121개 통과.

- [ ] **Step 5: 커밋**

```bash
git add docs/prd-ttokttok.md
git commit -m "docs(prd): 홈 카드 높이 결정 기록(62)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 완료 기준

- [ ] `npm run build` 통과 (타입체크 포함)
- [ ] `npm test` 121개 통과
- [ ] 375×812 / 320×568 / 1200×1080 / 어드민 미리보기 네 곳 모두 표지 비율 0.667
- [ ] `card-metrics.ts`의 값이 `card-feed.tsx`·`post-preview.tsx` 어디에도 복제돼 있지 않다
- [ ] DESIGN.md·PRD §11이 코드와 같은 커밋에서 갱신됐다
