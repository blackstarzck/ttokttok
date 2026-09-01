# 똑똑 프론트엔드 개발 가이드

사용자 화면(컴포넌트·페이지·훅)을 만들거나 수정하기 전에 반드시 읽는 문서.
시각 언어(색·타이포·간격·컴포넌트 스타일)는 [DESIGN.md](./DESIGN.md)가 담당하고, 이 문서는 **구조와 규칙**만 다룬다.
제품 요구사항·데이터 모델의 원천은 [prd-ttokttok.md](./prd-ttokttok.md)다.

## 1. 디렉터리 규칙

```
src/
├─ app/
│  ├─ (main)/          # GNB(홈/탐색/프로필)가 붙는 화면
│  ├─ read/[bookId]/   # EPUB 뷰어 — GNB 없음, 풀스크린
│  ├─ admin/           # 어드민 CMS — GNB 없음, admin role 전용
│  └─ login/
├─ components/
│  ├─ ui/              # shadcn 원본. 직접 수정 최소화(스타일 변형은 variant 추가로)
│  ├─ layout/          # 셸 부품 (BottomNav 등)
│  ├─ feed/            # 피드 도메인 (스냅 스크롤, 액션 바, 캐러셀)
│  ├─ cards/           # 카드 템플릿 레지스트리 (§3)
│  ├─ book/            # 도서 상세 시트 — 피드·탐색·프로필이 공유 (PRD §5.12)
│  ├─ reader/          # 뷰어 도메인
│  └─ admin/           # 어드민 전용 조각
├─ lib/
│  ├─ supabase/        # client.ts(브라우저) / server.ts(서버)
│  └─ …                # 도메인 로직, 유틸
└─ hooks/              # 공용 커스텀 훅
```

- 화면 전용 조각은 도메인 폴더에, 두 도메인 이상에서 쓰이면 그때 승격한다. **미리 일반화하지 않는다.**
- 파일명 kebab-case, 컴포넌트는 named export. `export default`는 Next가 요구하는 곳(page/layout)만.

## 2. 컴포넌트 규칙

- **서버 컴포넌트가 기본값.** `"use client"`는 상태·이벤트·브라우저 API가 필요한 최소 단위(leaf)에만 붙인다. 페이지 전체를 클라이언트로 만들지 않는다.
- 재사용은 **조합(composition)으로**: boolean prop이 늘어나면 (`isCompact`, `showMeta`…) 설계 오류 신호다. variant 컴포넌트 분리 또는 children 조합으로 푼다.
- shadcn 컴포넌트를 감싸서 도메인 컴포넌트를 만들 때, shadcn의 prop을 그대로 통과시키지 말고 도메인 언어의 좁은 인터페이스를 노출한다.
- 접근성 최소선: 아이콘 단독 버튼에 `aria-label`, 활성 탭에 `aria-current`, 자동재생 영상은 항상 음소거 시작.

## 3. 게시물 템플릿 · 영역 레지스트리 (핵심 규약)

카드 게시물 본문은 페이지네이션 없는 한 장이고, 데이터는 `{ template: "a", regions: { "hook": { "variant": "a", "text": "..." }, ... } }` 형태의 1:1 상세 행이다 (PRD §5.2).

- 레지스트리는 `src/components/cards/registry.ts` **한 곳**: `POST_TEMPLATES`(템플릿 → 영역 구성·순서, **순서는 템플릿이 고정**)와 `REGION_REGISTRY`(영역 → 입력 종류·필수 여부·글자 수 상한·UI 유형들). 영역 컴포넌트는 `regions.tsx`에 산다.
- 렌더 폴백 3규칙 (`template-card.tsx`):
  - 알 수 없는 **템플릿** → 그 게시물만 스킵 — 피드 전체를 죽이지 않는다.
  - 필수 입력(훅)이 빈 카드 → 스킵 + `console.error`. 어드민 미리보기(`preview`)에서는 자리표시를 대신 그리고 로그를 남기지 않는다 — 편집 중에는 타건마다 실패한다.
  - 알 수 없는 **유형(variant)** → 스킵하지 않고 `defaultVariant`로 폴백 — 유형이 코드에서 사라졌다고 게시물이 통째로 사라지는 것보다 기본 모양이 낫다.
- 어드민 폼 정의(입력 종류·필수 여부·글자 수 상한·유형 라벨)는 레지스트리가 노출한다. 어드민 편집기는 레지스트리만 보므로 템플릿·유형을 늘려도 편집기는 손대지 않는다.
- **영역 컴포넌트는 순수해야 한다** — fetch·effect·집계 호출을 넣지 않는다. 어드민 미리보기가 같은 컴포넌트를 그대로 렌더하므로(PRD §5.10), 부수효과를 넣으면 관리자가 편집하는 동안 그것이 실행된다. 데이터는 `book`과 `text`에서만 온다. 정렬 규약: 부모는 좌측 정렬 세로 스택 — 중앙 유형은 스스로 `self-center`를 갖는다.
- 인용구·상세정보는 여기 없다 — 도서 메타라서 도서 상세 시트가 보여준다 (PRD §5.12).
- 추가 절차: 유형은 ① `regions.tsx`에 variant 추가, 템플릿은 ① `POST_TEMPLATES`에 영역 순서 정의 → ② PRD §5.2 표 갱신 → ③ 375×812 미리보기에서 실제로 그려 보고 넘긴다.

## 4. 상태 관리 — 3분류, 그 외 금지

| 분류 | 도구 | 예 |
|---|---|---|
| 서버 상태 | **TanStack Query** (클라이언트에서 fetch가 처음 필요해질 때 도입) | 피드 페이지네이션, 댓글 목록, 좋아요 여부 |
| UI 상태 | `useState` / 필요 시 context (셸 범위 한정) | 드로어 열림, 음소거 토글, 캐러셀 인덱스 |
| URL 상태 | `searchParams` / 동적 세그먼트 | 검색어, 장르 필터, 게시물 딥링크 |

- **전역 클라이언트 스토어(Zustand 등)는 도입 금지** — 위 3분류로 풀리지 않는 사례가 실제로 나왔을 때 재논의한다.
- 서버 상태를 `useState`+`useEffect`로 수동 fetch하지 않는다. 서버 컴포넌트에서 읽을 수 있으면 그게 우선이다.
- 좋아요·찜처럼 즉각 반응이 필요한 토글은 optimistic update + 실패 시 롤백·토스트.

## 5. 데이터 접근

- 서버 컴포넌트/라우트 핸들러 → `lib/supabase/server.ts`, 클라이언트 컴포넌트 → `lib/supabase/client.ts`. **혼용 금지.**
- 보안은 RLS가 담당한다. 클라이언트 쿼리는 anon key로 충분해야 하며, 프론트에서 권한 분기로 보안을 흉내 내지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 코드에서만. 용도는 EPUB signed URL 발급, 어드민 API 두 가지뿐이다.
- 카운터(like/comment/share/view_count)는 **직접 update하지 않는다** — 트리거와 RPC(`record_view`, `record_share`)가 유일한 경로다.
- 조회 로깅: 게시물이 뷰포트에 1초 이상 → `record_view(post_id, session_id)`. session_id는 localStorage의 랜덤 UUID.

## 6. 성능 (PRD §7의 실행 규칙)

- 피드는 앞뒤 2~3개 게시물만 마운트 (가상화). 영상은 뷰포트 이탈 시 `pause()`.
- 이미지는 항상 `next/image` + `sizes` 지정. 커버 이미지는 aspect-ratio로 공간 예약 (CLS < 0.1).
- 무거운 라이브러리(epub.js 등)는 `next/dynamic`으로 해당 라우트에서만 로드.
- 배럴 파일(`index.ts` 재수출) 만들지 않는다. 직접 경로 import.
- 스크롤 리스너는 passive, 가급적 IntersectionObserver로 대체.
  - 검증 주의: IO·`requestAnimationFrame`·scroll 이벤트는 모두 페이지가 **컴포지팅 중일 때만** 동작한다. 탭이 가려진 헤드리스/숨은 뷰에서는 `scrollTop`이 바뀌어도 이벤트가 오지 않으므로, 스크롤 기반 동작은 반드시 보이는 브라우저에서 확인한다.
- 세부 패턴은 `vercel-react-best-practices` 스킬을 참조한다 (아래 §8).

## 7. 완료 기준

작업을 완료라고 말하기 전에:

```bash
npm run build
```

- 빌드(타입체크 포함)가 통과해야 한다. 화면 작업이면 브라우저에서 375px 뷰포트로 실제 렌더를 확인한다.
- 토큰·템플릿·상태 규칙을 새로 만들었거나 바꿨다면 이 문서/DESIGN.md/PRD 중 해당 문서를 같은 커밋에서 갱신한다.

## 8. 참조 스킬 (Claude Code)

| 상황 | 스킬 |
|---|---|
| React/Next 성능 패턴이 필요할 때 | `vercel-react-best-practices` |
| 컴포넌트 API 설계·리팩터링 | `vercel-composition-patterns` |
| shadcn 컴포넌트 탐색·추가 | shadcn MCP (`.mcp.json` 등록됨) |
| 화면 완성 후 UX·접근성 감사 | `web-design-guidelines` |
