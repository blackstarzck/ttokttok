-- ============================================================
-- 도서 모델 v2 (PRD §6, 결정 기록 §11-29~32)
--
-- preview·발췌·챕터 잠금 개념을 폐기하고, 도서를 두 형태로 정리한다.
--   전문 도서  = epub_path NOT NULL → 뷰어에서 끝까지 읽힌다
--   링크형 도서 = epub_path NULL     → 본문 미보유, 카드 소개 + 서점 링크
--
-- 기존 데이터 확인: books 8행 전부 access_type='full'이고 'preview' 행은
-- 없다. 따라서 컬럼 드롭만으로 충분하고 별도 데이터 이관이 필요 없다.
-- ============================================================

alter table public.books drop column access_type;
alter table public.books drop column preview_chapter_limit;

-- 수급 이력 (§5.11) — 어느 경로로 확보했고 무슨 근거로 공개 가능한지
alter table public.books add column source text;      -- gongu | wikisource | manual …
alter table public.books add column rights_note text; -- 만료 판별·확보 경위 메모

comment on column public.books.epub_path is
  '전문 도서 판별 기준. NOT NULL이면 전문 도서(뷰어 대상), NULL이면 링크형 도서.';
comment on column public.books.source is
  '수급 출처: gongu | wikisource | manual 등';
comment on column public.books.rights_note is
  '권리 근거 메모 (저작자 사망 연도·만료 판별·확보 경위)';

-- 링크형 도서는 서점 검색 URL을 만들 수단이 있어야 한다.
-- purchase_links가 없으면 ISBN으로 자동 생성하므로 둘 중 하나는 필수.
--
-- NOT VALID: 현재 8행은 전문 도서로 시딩됐으나 EPUB이 아직 업로드되지
-- 않아 세 컬럼이 모두 NULL이다. 기존 행을 막지 않고 앞으로의 쓰기만
-- 검증한다. 위키문헌 EPUB 수급이 끝나면 다음 마이그레이션에서
--   alter table public.books validate constraint books_needs_epub_or_store_ref;
-- 로 전수 검증할 것.
alter table public.books
  add constraint books_needs_epub_or_store_ref
  check (
    epub_path is not null
    or isbn is not null
    or purchase_links is not null
  )
  not valid;
