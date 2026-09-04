-- ============================================================
-- books.source_ref — 수급 원천의 식별자 (PRD §5.11, 결정 기록 §11-50)
--
-- `source`는 'wikisource' | 'gongu' | 'manual' 처럼 경로만 적는다. 어느
-- 문서에서 왔는지가 남지 않아 ① 같은 책을 두 번 임포트해도 아무도 모르고
-- ② 원문이 개정됐을 때 재수급 대상을 찾을 수 없었다.
--
-- 형식은 URL이 아니라 **정규화한 문서 제목**이다 (퍼센트 디코드, `_`→공백).
-- ws-export의 입력으로 그대로 쓸 수 있고, 어드민에서 읽히고, 임포트·시드·
-- 재수급이 같은 함수(src/lib/wikisource.ts의 toPageTitle)를 거치므로
-- unique 인덱스가 실제로 중복을 잡는다. URL을 넣으면 인코딩·모바일 도메인
-- 차이로 같은 문서가 서로 다른 문자열이 된다.
-- ============================================================

alter table public.books add column source_ref text;

comment on column public.books.source_ref is
  '수급 원천의 식별자. 위키문헌은 정규화한 문서 제목(퍼센트 디코드, 밑줄→공백).';

-- 기존 위키문헌 8권 백필. 대개 도서 제목이 곧 문서 제목이지만, 동명 문서가
-- 있어 위키문헌 쪽에 괄호가 붙은 두 권은 따로 적는다 — 이 값은
-- scripts/refresh-epubs.mjs의 PAGE_OVERRIDES에 이미 적혀 있던 것을 옮긴 것이고,
-- 옮기고 나면 그 표를 지운다.
--
-- 백필을 생략하면 PAGE_OVERRIDES를 지운 직후 그 두 권의 재수급이 깨지고
-- "마이그레이션 뒤에 시드를 한 번 돌려야 한다"는 숨은 순서 의존이 생긴다.
update public.books
  set source_ref = title
  where source = 'wikisource' and source_ref is null;

update public.books
  set source_ref = '하늘과 바람과 별과 시 (1948년)'
  where source = 'wikisource' and title = '하늘과 바람과 별과 시';

update public.books
  set source_ref = '진달래꽃 (시집)'
  where source = 'wikisource' and title = '진달래꽃';

-- 수동 등록 도서는 source_ref가 null이고 그 수가 많아질 수 있다.
-- 전체 unique면 두 번째 null 행부터 막히므로 부분 인덱스여야 한다.
create unique index books_source_ref_key
  on public.books (source_ref)
  where source_ref is not null;
