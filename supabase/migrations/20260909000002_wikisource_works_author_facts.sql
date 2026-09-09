-- ============================================================
-- wikisource_works에 저자 판정의 근거를 남긴다 (결정 기록 §11-66)
--
-- 왜: 지금 행은 「어떤 규칙으로 통과했는지」를 기록하지 않는다. 화면이 매번
-- 다시 보는 것은 금지 저작자 명단뿐이고, 사망 연도·국적은 동기화 시점
-- 판정으로 얼어붙는다. 그래서 누가 PUBLIC_DOMAIN_DEATH_BEFORE를 바꾸거나
-- KOREAN_AUTHOR를 좁혀 배포하면, 화면은 낡은 승인으로 「가져오기」를 계속
-- 내놓는다 — books에 초안 상태가 없어 한 번 누르면 즉시 공개다.
--
-- 이 값들을 저장하면 화면이 렌더 시점에 규칙을 다시 적용할 수 있다. 장르와
-- pd_tag는 이미 행에 있으므로, 저자 쪽 네 값이 더해지면 동기화가 적용한
-- 모든 조건을 화면에서 재현할 수 있다.
--
-- nullable인 이유: 기존 293행에는 이 값이 없다. 화면은 null을 「검증값 없음
-- — 동기화가 필요하다」로 읽고 「가져오기」를 내주지 않는다. 다음 동기화가
-- 채운다. 기본값을 주면 검증하지 않은 행이 검증된 척하게 된다.
-- ============================================================

alter table public.wikisource_works
  add column author_born            int,
  add column author_died            int,
  add column author_is_korean       boolean,
  add column author_is_north_korean boolean;

comment on column public.wikisource_works.author_died is
  '저자 문서 분류에서 읽은 사망 연도. PRD §5.11(1962년 이전 사망) 판정의 근거이며 화면이 렌더 시점에 다시 확인한다.';
comment on column public.wikisource_works.author_is_korean is
  '저자 문서의 국적 분류. 한국 저자가 아니면 번역자 저작권이 별개다 (PRD §5.11).';
