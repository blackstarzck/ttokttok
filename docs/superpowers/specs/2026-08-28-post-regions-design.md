# 게시물 영역(Region) 모델 — 카드 캐러셀 해체

작성일 2026-08-28 · 상태: 승인됨

## 문제 (요구사항 교정)

기존 구현은 "게시물 = 카드 여러 장의 가로 캐러셀"이었고 각 슬라이드가
템플릿(a 훅 / b 상세 / c 인용구)이었다. 실제 의도는 다르다:

1. **게시물 본문은 한 장**이다 — 페이지네이션 없음. 템플릿의 단위는
   카드가 아니라 **화면 안의 영역(region)**이다. 예: 장르 영역의
   `genre-template-b` = 좌측 정렬 · 20px · 700.
2. **인용구·상세정보는 본문이 아니라 도서의 메타정보**다. 하단 도서
   섹션을 탭했을 때 열리는 바텀시트(BookSheet)의 2번째(인용구)·
   3번째(상세정보) 섹션으로 노출된다.

## 확정 사항 (사용자 답변)

| 질문 | 답 |
|---|---|
| 템플릿 구조 | **2단계** — 게시물 템플릿이 영역 구성·순서를 정하고, 각 영역의 UI 유형은 관리자가 고른다 |
| 인용구·상세정보 소속 | **둘 다 도서 메타** — 인용구는 도서 폼에서 입력, 상세정보는 기존 도서 필드로 자동 구성 |
| 영역 순서 | **템플릿이 고정** — 관리자가 못 바꾼다. 카드 DnD는 제거 |

깔린 가정: 인용구는 도서당 1개로 시작. 기존 카드 시드의 인용구 문구는
시드를 새 모델로 다시 써서 옮긴다 (이관 스크립트 없음).

## 데이터 모델

```sql
-- books에 인용구 메타
alter table books add column quote text, add column quote_source text;

-- post_cards 재정의: 목록 → 한 장 (post_videos와 같은 1:1 상세 테이블 패턴)
drop table post_cards;
create table post_cards (
  post_id uuid primary key references posts on delete cascade,
  template text not null,               -- 게시물 템플릿 키 (프론트 레지스트리)
  regions jsonb not null default '{}'   -- { "hook": { "variant": "a", "text": "..." }, ... }
);
-- RLS는 기존 정책 그대로 재생성 (발행분만 공개 / admin 전체)
```

`posts.type = 'cards'`는 유지한다 — "카드 게시물"이라는 개념은 남고,
카드가 한 장이 될 뿐이다. RPC·트리거·피드가 type을 그대로 쓴다.

## 프론트 레지스트리 (FRONTEND.md §3 대체)

```
POST_TEMPLATES: 템플릿 키 → { label, regions: 영역 키 순서 배열 }
  a "커버 중심":  cover → genre → biblio → hook → desc   (현행 훅 카드의 분해)
  b "텍스트 중심": genre → hook → desc → biblio           (커버 없음 — 하단 바가 커버를 이미 보여준다)

REGION_REGISTRY: 영역 키 → { label, input, required, defaultVariant, variants }
  cover  (입력 없음)        a 중앙 표준 w-36 / b 좌측 소형 w-24
  genre  (입력 없음)        a 캡션(현행) / b 헤드라인(좌측·text-xl·bold — 사용자 예시 그대로)
  biblio (입력 없음)        a 중앙(현행) / b 좌측   — 도서명·출판사·저자/옮긴이
  hook   (text, 필수)       a 중앙 강조(현행) / b 좌측
  desc   (textarea, 선택)   a 중앙(현행) / b 좌측
```

- 템플릿 a + 모든 영역 variant a = **기존 훅 카드와 같은 화면** (회귀 없음).
- 알 수 없는 템플릿 → 피드에서 스킵(기존 규약 유지), 미리보기에선 자리표시.
- 알 수 없는 variant → **defaultVariant로 폴백** — variant가 없어졌다고
  게시물이 통째로 사라지는 것보다 기본 모양이 낫다.
- 필수 입력(훅)이 빈 카드 → 피드 스킵 + console.error, 미리보기 자리표시.
- 영역 컴포넌트 순수성 규약(부수효과 금지)은 그대로 — 미리보기가 공유한다.

## BookSheet (PRD §5.12)

ScrollArea 내부 구성이 3단이 된다:
1. 소개(intro) — 현행
2. **인용구** — `quote` 타이포 토큰(20px·500·1.7) 그대로. 출처가 없으면 "제목 · 저자"
3. **상세 정보** — 출판사·페이지·출간일·ISBN + 목차 (기존에 흩어져 있던 목차·ISBN을 이 섹션으로 통합)

## 어드민

- **도서 폼**: "인용구" 섹션 추가 (문장 textarea + 출처 input).
- **게시물 폼**: 채널 → 도서 → **게시물 템플릿 선택** → 영역 목록(템플릿이
  정한 순서대로): 영역 라벨 + UI 유형 select + (훅·부연은) 텍스트 입력.
  폼 필드 규약: `template`, `region-{키}-variant`, `region-{키}-text`.
- 영역 값은 영역 키로 저장하므로 **템플릿을 바꿔도 입력값이 살아남는다**.
- 미리보기: 이전 스펙 그대로 (PostItem 공유·375×812·inert·자리표시).
  activeIndex(캐러셀 추적)는 대상이 사라져 제거.
- 카드 DnD·CardComposer·CardFieldset 삭제, @dnd-kit 4패키지 제거.

## 구현 계획 (실행 순서)

1. 마이그레이션 `20260828000003_post_regions.sql` → `db push`
2. 레지스트리·영역 컴포넌트·TemplateCard·자리표시 재작성 / hook·quote·detail
   카드, card-renderer, card-carousel 삭제
3. feed.ts 타입·SELECT, PostItem, /p/[postId], BookSheet
4. 어드민: post-editor·post-form·actions 재작성, composer·fieldset 삭제,
   book-form·books actions·페이지 select에 quote 추가
5. seed.mjs 재작성 (인용구 → books, 카드 → 레이아웃 1행, 일부 게시물 템플릿 b) → 실행
6. dnd-kit 제거 → build
7. 브라우저 검증 (375 피드·BookSheet·어드민 폼·미리보기)
8. 문서: PRD §5.2 재작성·§5.10·§5.12·결정기록 §11-41, FRONTEND.md §3,
   DESIGN.md quote 용도 문구

## 검증 기준

- `npm run build` 통과
- 375에서: 피드 게시물이 한 장으로 렌더(인디케이터 없음), 템플릿 b 게시물
  존재, BookSheet 2·3번째 섹션 확인
- 어드민: 템플릿·영역 유형 변경이 미리보기에 즉시 반영, 저장 후 재편집
  시 값 복원
- 피드에서 캐러셀·dnd-kit 코드 참조 0건
