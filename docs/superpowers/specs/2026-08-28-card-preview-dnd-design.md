# 카드 게시물 편집기 — 실시간 미리보기 + 카드 순서 DnD

작성일 2026-08-28 · 상태: **부분 대체됨** — 카드 캐러셀·카드 DnD는 [2026-08-28-post-regions-design.md](./2026-08-28-post-regions-design.md)의 영역 모델로 대체됐다. 미리보기 설계(§1·2·3·4·6)는 그대로 유효하다.

## 문제

관리자가 카드 조합(템플릿 종류·순서·문구)을 짜는 동안, 그 결과가 사용자
화면에서 어떻게 보이는지 알 수 없다. 저장하고 피드로 가서 확인하는
왕복이 매번 필요하다.

## 목표

- 게시물 작성/수정 화면 우측에 375×812 미리보기를 두고, 입력·템플릿
  선택·순서 변경을 실시간으로 반영한다.
- 미리보기와 실제 사용자 화면이 **픽셀 단위로 일치**한다.
- 카드 순서를 드래그로 바꾼다.

## 비목표

- 영상 게시물 폼의 미리보기 (유튜브는 조합 문제가 없고 URL로 이미 확인된다).
- 다크 모드 미리보기 (어드민은 라이트 고정 — PRD §11-35).
- 기기 프리셋 전환.

## 핵심 결정

### 1. CSS 동기화는 "복제"가 아니라 "공유"로 한다

미리보기는 실제 피드가 쓰는 `PostItem`을 **그대로 임포트**한다. 마크업이나
클래스를 옮겨 적지 않는다 — 옮겨 적는 순간 두 벌이 되고, 한쪽만 고쳐지는
날이 온다.

성립 근거: 카드 컴포넌트(`HookCard`·`DetailCard`·`QuoteCard`)에 fetch·
effect·이벤트가 없다. 검증 결과 `PostItem`이 마운트하는 트리 전체에
마운트 시점 부수효과가 없다 (`comment-sheet`는 `enabled: open`,
`book-sheet`는 `if (open)` 게이트).

**따라붙는 규약:** 카드 컴포넌트에 부수효과를 넣으면 미리보기가 오염된다.
FRONTEND.md §3에 명시한다.

### 2. `inert`로 감싼다

`ActionBar`는 `record_share` RPC와 analytics를 실제로 호출한다. 미리보기에서
눌리면 집계가 오염된다. `inert`는 하위 트리의 포인터·키보드·포커스를
브라우저 수준에서 차단한다 — `pointer-events-none`과 달리 키보드로 뚫리지
않는다.

### 3. 프레임은 375×812 고정

AGENTS.md 완료 기준이 "375px 뷰포트에서 실제 렌더 확인"이다. 가장 좁고 낮은
기기에서 안 넘치면 나머지는 안전하다. 프레임 내부는 `MainLayout`과 같은
박스 구조(`flex-col` + `min-h-0 flex-1` + `BottomNav`)로 맞춘다.

관리자 창 높이에 맞추는 안은 기각했다 — 모니터 높이는 사용자 폰과 무관해서
오버플로 판단의 근거가 되지 못한다.

### 4. 필수 입력이 빈 카드는 자리표시 카드로 그린다

`CardRenderer`는 스키마 검증 실패 시 조용히 스킵한다(FRONTEND.md §3). 편집
중에는 필수 슬롯이 비어 있는 게 정상이므로, 그대로 두면 카드를 추가한
순간 화면에서 사라져 고장처럼 보인다.

`preview` 플래그가 켜지면 점선 자리표시를 그린다. 실제 피드 동작은
그대로다 (`preview` 미전달 = 지금과 바이트 단위로 동일).

미리보기에서는 `console.error`를 남기지 않는다 — 매 타건마다 실패하므로
콘솔이 묻힌다.

### 5. 상태를 `PostEditor`로 끌어올린다

```
PostEditor (클라이언트, 상태 소유)
  { channelId, bookId, cards: {uid, template_category, body}[], activeIndex }
   ├─ 좌: 채널 select · BookSelect · CardComposer
   │        폼 필드명 card-{i}-{슬롯} 규약 유지 → 서버 액션 무변경
   └─ 우: PostPreview (sticky)
            useQuery(["admin","preview-book",bookId]) → FeedBook
            <div inert><PostItem preview={{activeIndex}} /></div>
```

폼 DOM의 `input` 이벤트를 듣는 안은 기각했다 — React 상태와 DOM 상태가 두
벌이 되고, DnD로 순서를 바꾸면 어긋난다.

iframe + postMessage 안은 보류했다 — CSS 격리는 완벽하지만 미리보기 전용
라우트가 필요하고 첫 렌더가 늦다. 캐스케이드 오염이 실제로 관측되면 전환한다.

### 6. 도서 데이터는 선택 시점에 브라우저 클라이언트로 가져온다

미리보기에는 표지·목차·ISBN·출판사까지 필요하지만, 목록에 미리 다 실으면
도서가 늘수록 폼이 무거워진다. 고른 순간에 한 권만 읽는다 + TanStack Query
(FRONTEND.md §4 — 서버 상태는 TanStack Query).

처음에는 서버 액션으로 만들었다가 **브라우저 클라이언트(anon 키)로 바꿨다.**
books는 공개 읽기(RLS `books_select_all`)라 anon 키로 충분하고, 클라이언트
컴포넌트는 client.ts를 쓴다는 규칙(FRONTEND.md §5)에도 맞는다. 무엇보다
미리보기는 도서를 고를 때마다 호출되는데, 그때마다 서버 액션이
`auth.getUser()`로 어드민 세션의 토큰 갱신 경로를 건드릴 이유가 없다.

### 7. DnD는 `@dnd-kit`

`@dnd-kit/core@6` + `sortable@10` + `modifiers` + `utilities`. peer가
`react >=16.8`이라 React 19에서 충돌 없다. 신형 `@dnd-kit/react`는 0.5.0이라
쓰지 않는다. 어드민 라우트에만 들어간다.

- **핸들만 드래그 소스.** fieldset 전체를 잡게 하면 인풋 안에서 텍스트를
  드래그 선택할 수 없다.
- `restrictToVerticalAxis` + `restrictToParentElement`.
- 기존 ↑/↓ 버튼은 남긴다. 이미 동작하고, 없앨 이유가 없다.

**선행 리팩터링 (필수):** 지금 `key={i}`(인덱스 키)라 순서를 바꾸면 React가
같은 DOM을 재사용해 입력 포커스와 IME 조합 중인 한글이 엉킨다. 카드마다
`uid`를 붙인다. `crypto.randomUUID()`는 SSR/CSR 값이 달라 하이드레이션이
깨지므로 단조 증가 카운터로 만든다.

`useSortable`은 `.map` 안에서 부를 수 없으므로 카드 한 장의 편집 UI를
`CardFieldset`으로 분리한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `components/cards/card-placeholder.tsx` | 신규 — 자리표시 카드 |
| `components/cards/card-renderer.tsx` | `preview?: boolean` 추가 |
| `components/feed/card-carousel.tsx` | `preview?: CardPreview` 추가 + activeIndex 스크롤 |
| `components/feed/post-item.tsx` | `preview` 전달 |
| `components/admin/post-editor.tsx` | 신규 — 상태 소유 + 2단 레이아웃 |
| `components/admin/post-preview.tsx` | 신규 — 프레임 + inert PostItem |
| `components/admin/card-composer.tsx` | controlled + DndContext |
| `components/admin/card-fieldset.tsx` | 신규 — 카드 한 장 + useSortable |
| `components/admin/book-select.tsx` | `onValueChange` 콜백 추가 |
| `components/admin/post-form.tsx` | form 껍데기만 남기고 PostEditor 위임 |
| `app/admin/(dashboard)/posts/{new,[postId]}/page.tsx` | channels에 slug·avatar_url |

서버 액션 `savePost`/`readCards`는 **손대지 않는다**.

## 검증

- `npm run build` 통과
- 375 프레임에서 실제 렌더 확인, 타이핑 → 미리보기 반영, 템플릿 변경 반영
- DnD 후 저장 → DB `sort_order` 확인

**한계 (미리 밝힘):** 이 환경의 브라우저 패널은 컴포지팅을 하지 않아
포인터 드래그를 재현할 수 없다. DnD는 상태 변화와 저장 결과까지만
검증하고, 드래그 조작감은 사람이 확인해야 한다.
