-- 게시물 영역(Region) 모델 전환 (PRD §5.2 개정, 결정 기록 §11-41)
--
-- 기존 모델은 "게시물 = 카드 여러 장의 가로 캐러셀"이었고 각 슬라이드가
-- 템플릿(a 훅 / b 상세 / c 인용구)이었다. 실제 제품 의도는:
--
--   1. 게시물 본문은 페이지네이션 없는 한 장이고, 템플릿의 단위는 카드가
--      아니라 화면 안의 "영역"이다 (게시물 템플릿이 영역 구성·순서를
--      고정하고, 각 영역의 UI 유형은 관리자가 고른다).
--   2. 인용구·상세정보는 본문이 아니라 도서의 메타정보다 — 도서 상세
--      시트(BookSheet)의 2·3번째 섹션으로 노출된다.
--
-- 기존 카드 데이터는 시드뿐이라 이관하지 않는다 — scripts/seed.mjs가
-- 새 모델로 다시 채운다.

-- ① 인용구는 도서 메타가 된다 (도서당 1개로 시작).
alter table public.books
  add column quote text,
  add column quote_source text;

comment on column public.books.quote is
  '도서 상세 시트 2번째 섹션에 노출되는 대표 인용구 (없으면 섹션 생략)';
comment on column public.books.quote_source is
  '인용구 출처 표기. 없으면 "제목 · 저자"로 대체';

-- ② post_cards 재정의: 카드 목록 → 카드 한 장(영역 조합).
--    post_videos와 같은 1:1 상세 테이블 패턴 (post_id가 PK).
drop table public.post_cards;

create table public.post_cards (
  post_id uuid primary key references public.posts (id) on delete cascade,
  template text not null,                    -- 게시물 템플릿 키 (프론트 레지스트리: POST_TEMPLATES)
  regions jsonb not null default '{}'::jsonb -- { "hook": { "variant": "a", "text": "..." }, ... }
);

-- ③ RLS — 테이블 drop으로 사라진 정책을 기존과 같은 규칙으로 재생성.
alter table public.post_cards enable row level security;

create policy "post_cards_select_published" on public.post_cards
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and (p.status = 'published' or public.is_admin())
    )
  );
create policy "post_cards_admin_write" on public.post_cards
  for all using (public.is_admin()) with check (public.is_admin());
