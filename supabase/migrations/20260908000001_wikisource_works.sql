-- ============================================================
-- wikisource_works — 위키문헌에서 가져올 수 있는 작품 후보 목록
-- (PRD §5.10, 결정 기록 §11-65, 설계: docs/superpowers/specs/2026-09-08-*)
--
-- 왜 우리 표에 두는가: 후보는 실측 293개(2026-09-09, 최초 설계 시점은
-- 329개였다)이고 위키문헌 API로 그걸 모으려면 요청이 약 51회 필요하다.
-- 위키문헌 레이트 리밋은 2초 간격에서도 걸릴 만큼 세서(실측 3회 차단)
-- 화면이 직접 부를 수 없다. 검색·정렬·필터도 위키문헌 API로는 안 된다.
-- 사람이 드물게 돌리는 동기화 스크립트가 이 표를 채우고, 화면은 우리
-- DB만 읽는다.
--
-- 이 표는 **후보지 계획이 아니다.** 293개 중 실제로 등록할 것은 수십 개다.
-- ============================================================

create table public.wikisource_works (
  -- 위키문헌 문서 제목. books.source_ref와 **같은 정규화**를 거친 형식이라
  -- (src/lib/wikisource.ts의 toPageTitle) 두 값을 바로 짝지어 "이미 등록됨"을
  -- 판정한다. 형식이 어긋나면 등록 여부 판정이 조용히 깨진다.
  page_title  text primary key,

  -- 표시용 제목. 머리말 틀의 `제목`, 없으면 page_title.
  title       text not null,

  -- 머리말 틀의 `저자`|`지은이`|`글쓴이`|`author`. 스키마는 파싱 실패에
  -- 대비해 nullable로 남겨 두지만, 실제로는 이 표에 null이 없다 — 저자를
  -- 못 읽은 문서는 동기화 스크립트가 애초에 담지 않는다(아래 이유).
  --
  -- **이 열이 "표에 남기고 가져올 때 입력받는다"였던 시절이 있었다**
  -- (2026-09-08 최초 설계 — 당시 근거는 표본 99개 중 실패 1건, 「강촌
  -- (두보)」처럼 다른 틀을 쓰는 문서였다). 329편 전수 조사(2026-09-09)로
  -- 원인이 항목 이름 어휘 부족(영어 이름 틀 13 · `글쓴이` 1)이었다는 것이
  -- 드러났고, 동시에 저자가 사망 연도·국적·금지 명단 세 검사의 입구라는
  -- 것도 드러났다 — 저자를 모르면 그 셋을 하나도 판정할 수 없어, 기계가
  -- 아무것도 보증하지 못하는 행을 후보 목록에 둘 수 없다. 그래서 지금은
  -- 저자를 못 읽은 문서(어휘를 넓힌 뒤로는 「모비딕」 1편뿐)를 표에 담지
  -- 않는다. 그런 작품은 `/admin/books/import`에서 사람이 저자를 입력한다.
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
  -- 그물일 뿐 등록 허가가 아니다 — **2026-09-09부터는 그물에 그치지 않고
  -- 저자 문서의 사망 연도·국적을 직접 읽어 그 기준을 기계로도 구현한다**
  -- (scripts/sync-wikisource-works.mjs, src/lib/wikisource-meta.ts의
  -- checkAuthor). 그 전에는 이 태그만 믿고 있었고, 그래서 329편 중 8편이
  -- §5.11 기준 미달인 채로 목록에 보이고 있었다.
  pd_tag      text not null,

  -- 머리말 틀의 `역자`. null이 아니면 번역물이다.
  --
  -- 번역물을 표에서 지우지 않고 여기 기록하는 이유: 나중에 "왜 이 작품이
  -- 목록에 없나"를 DB에서 답할 수 있다. 지우면 그 질문에 답할 수 없다.
  -- 목록 화면이 숨기는 것은 화면의 일이다 (src/lib/book-rights.ts의 isListable).
  --
  -- **다만 2026-09-09부터 이 화면 숨김은 거의 발동하지 않는다.** 번역물은
  -- 원저자가 외국인인 경우가 대부분이라 위 `pd_tag`/저자 판정 단계의 「해외
  -- 저자」 검사가 표에 담기 전에 먼저 걸러낸다 — 지금 이 표에는 번역물이
  -- 0건이다. 열과 화면 숨김 로직은 그대로 둔다: 한국인이 이미 만료된 한국
  -- 저자를 번역한 경우는 여전히 이 열로만 구별할 수 있다.
  translator  text,

  -- 언제 기준의 목록인지. 화면에 적는다 — 목록은 동기화 시점의 스냅숏이다.
  synced_at   timestamptz not null default now()
);

comment on table public.wikisource_works is
  '위키문헌에서 가져올 수 있는 작품 후보. scripts/sync-wikisource-works.mjs가 채운다.';

-- 인덱스는 지금 규모(293행)에서 실행 계획에 거의 영향이 없다. 그래도 필터로
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
