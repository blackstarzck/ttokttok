-- ============================================================
-- wikisource_works — 위키문헌에서 가져올 수 있는 작품 후보 목록
-- (PRD §5.10, 결정 기록 §11-64, 설계: docs/superpowers/specs/2026-09-08-*)
--
-- 왜 우리 표에 두는가: 후보는 실측 329개이고 위키문헌 API로 그걸 모으려면
-- 요청이 47회 필요하다. 위키문헌 레이트 리밋은 2초 간격에서도 걸릴 만큼
-- 세서(실측 3회 차단) 화면이 직접 부를 수 없다. 검색·정렬·필터도 위키문헌
-- API로는 안 된다. 사람이 드물게 돌리는 동기화 스크립트가 이 표를 채우고,
-- 화면은 우리 DB만 읽는다.
--
-- 이 표는 **후보지 계획이 아니다.** 329개 중 실제로 등록할 것은 수십 개다.
-- ============================================================

create table public.wikisource_works (
  -- 위키문헌 문서 제목. books.source_ref와 **같은 정규화**를 거친 형식이라
  -- (src/lib/wikisource.ts의 toPageTitle) 두 값을 바로 짝지어 "이미 등록됨"을
  -- 판정한다. 형식이 어긋나면 등록 여부 판정이 조용히 깨진다.
  page_title  text primary key,

  -- 표시용 제목. 머리말 틀의 `제목`, 없으면 page_title.
  title       text not null,

  -- 머리말 틀의 `저자`|`지은이`. 파싱 실패 시 null — 「강촌 (두보)」처럼
  -- 다른 틀을 쓰는 문서가 표본 99개 중 1개 있었다. 그런 행도 목록에 남기고
  -- 가져올 때 저자를 입력받는다.
  author      text,

  -- 소설 계열 또는 시집. 이 행이 표에 있는 근거이므로 not null.
  genre       text not null,

  -- 분류 "NNNN년 작품" 중 가장 이른 것. 「상록수」처럼 둘이 붙은 경우가 있다.
  pub_year    int,

  -- PD-old-50 등. 태그가 없는 문서는 표에 담지 않으므로 not null.
  --
  -- **이 태그는 위키문헌의 판단이고 우리 기준과 다르다.** 우리 기준은 PRD
  -- §5.11의 한국 저작권법(1962년 이전 사망)이며, 등록 금지 목록은 이 태그와
  -- 무관하게 따로 있다(src/lib/book-rights.ts). 태그는 후보를 모으는
  -- 그물일 뿐 등록 허가가 아니다.
  pd_tag      text not null,

  -- 머리말 틀의 `역자`. null이 아니면 번역물이다.
  --
  -- 번역물을 표에서 지우지 않고 여기 기록하는 이유: 나중에 "왜 이 작품이
  -- 목록에 없나"를 DB에서 답할 수 있다. 지우면 그 질문에 답할 수 없다.
  -- 목록 화면이 숨기는 것은 화면의 일이다 (src/lib/book-rights.ts의 isListable).
  translator  text,

  -- 언제 기준의 목록인지. 화면에 적는다 — 목록은 동기화 시점의 스냅숏이다.
  synced_at   timestamptz not null default now()
);

comment on table public.wikisource_works is
  '위키문헌에서 가져올 수 있는 작품 후보. scripts/sync-wikisource-works.mjs가 채운다.';

-- 인덱스는 지금 규모(329행)에서 실행 계획에 거의 영향이 없다. 그래도 필터로
-- 쓰는 세 컬럼에 두는 이유는 이 표가 커질 때(범위를 넓히면 PD 후보 전체가
-- 2,350개다) 손댈 곳을 남기지 않으려는 것이다. 검색(`q=`)은 부분 일치라
-- trigram 없이는 인덱스가 안 쓰이는데, 그건 규모가 커지는 시점에 pg_trgm으로
-- 해결할 문제다.
create index wikisource_works_genre_idx  on public.wikisource_works (genre);
create index wikisource_works_author_idx on public.wikisource_works (author);
create index wikisource_works_year_idx   on public.wikisource_works (pub_year);

-- ------------------------------------------------------------
-- RLS — 어드민 전용. books와 달리 읽기를 공개하지 않는다.
--
-- 이 표는 "아직 검토하지 않은 후보"다. 공개하면 우리가 등록 의사를 밝히지
-- 않은 작품 목록이 서비스 밖으로 나간다. 금지 저작자의 작품도 표에 남아
-- 있으므로(화면에서만 가린다) 더욱 그렇다.
-- ------------------------------------------------------------
alter table public.wikisource_works enable row level security;

create policy "wikisource_works_admin_read" on public.wikisource_works
  for select using (public.is_admin());

-- 쓰기 정책을 두지 않는다. 동기화 스크립트가 유일한 필자이고 service role은
-- RLS를 우회한다. 정책이 없으면 anon·authenticated는 쓰기가 전부 막힌다.
