-- ============================================================
-- 똑똑 (Ttokttok) 초기 스키마
-- PRD 6장 데이터 모델 기준
-- ============================================================

-- 검색용 trigram (books.title/author ILIKE 검색 인덱스)
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- 프로필 (auth.users 1:1)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- 관리자 판별 헬퍼. RLS 정책 안에서 재귀 없이 쓰기 위해 security definer.
create function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 소셜 로그인 최초 진입 시 프로필 자동 생성
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      '독자-' || left(new.id::text, 8)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 채널 (장르별 큐레이션 페르소나)
-- ------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  avatar_url text,
  genre text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 도서
-- ------------------------------------------------------------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  translator text,
  publisher text,
  cover_url text,
  category text not null,
  isbn text,
  page_count int,
  pub_date_paper date,
  pub_date_ebook date,
  intro text,
  toc jsonb not null default '[]'::jsonb,          -- ["1장. …", "2장. …"]
  epub_path text,                                   -- storage 'epubs' 버킷 경로
  file_size_mb numeric,
  access_type text not null default 'preview' check (access_type in ('full', 'preview')),
  preview_chapter_limit int not null default 1,
  purchase_links jsonb,                             -- {"kyobo": url, ...} 수동 덮어쓰기. null이면 ISBN으로 자동 생성
  created_at timestamptz not null default now()
);

create index books_title_trgm_idx on public.books using gin (title gin_trgm_ops);
create index books_author_trgm_idx on public.books using gin (author gin_trgm_ops);
create index books_category_idx on public.books (category);

-- ------------------------------------------------------------
-- 게시물
-- ------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id),
  book_id uuid not null references public.books (id),
  type text not null check (type in ('cards', 'video')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  -- 비정규화 카운터 (트리거/RPC로만 증감)
  like_count int not null default 0,
  comment_count int not null default 0,
  share_count int not null default 0,
  view_count int not null default 0,
  created_at timestamptz not null default now()
);

create index posts_feed_idx on public.posts (status, published_at desc);
create index posts_book_idx on public.posts (book_id);
create index posts_channel_idx on public.posts (channel_id);

-- 템플릿 카드 (프론트 고정 템플릿 카테고리 + 슬롯 데이터)
create table public.post_cards (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  sort_order int not null default 0,
  template_category text not null,                  -- 'a' | 'b' | 'c' (프론트 레지스트리 키)
  body jsonb not null default '{}'::jsonb           -- { "title-01": "", "caption-01": "", ... }
);

create index post_cards_post_idx on public.post_cards (post_id, sort_order);

-- 영상 게시물 상세
create table public.post_videos (
  post_id uuid primary key references public.posts (id) on delete cascade,
  source_type text not null check (source_type in ('upload', 'youtube')),
  video_path text,                                  -- upload: storage 'videos' 버킷 경로
  youtube_id text,                                  -- youtube: 영상 ID
  duration_sec int,
  check (
    (source_type = 'upload' and video_path is not null)
    or (source_type = 'youtube' and youtube_id is not null)
  )
);

-- ------------------------------------------------------------
-- 소셜: 좋아요 / 댓글 / 신고
-- ------------------------------------------------------------
create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_idx on public.likes (post_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index comments_post_idx on public.comments (post_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'etc')),
  status text not null default 'open' check (status in ('open', 'deleted', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)                  -- 같은 댓글 중복 신고 방지
);

create table public.banned_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique
);

-- ------------------------------------------------------------
-- 기록: 보관함 / 진행률 / 조회 로그
-- ------------------------------------------------------------
create table public.bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.reading_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  epub_cfi text,
  percent numeric not null default 0 check (percent >= 0 and percent <= 100),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create table public.view_logs (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,                                  -- 게스트 식별용
  created_at timestamptz not null default now()
);

create index view_logs_trending_idx on public.view_logs (post_id, created_at desc);

-- ------------------------------------------------------------
-- 탐색: 오늘의 추천
-- ------------------------------------------------------------
create table public.featured_books (
  book_id uuid primary key references public.books (id) on delete cascade,
  sort_order int not null default 0,
  active boolean not null default true
);
