-- ============================================================
-- RLS 정책 + 스토리지 버킷
-- 원칙 (PRD 6장):
--   읽기 — 발행 콘텐츠·도서·채널은 공개
--   쓰기 — 개인 데이터는 본인 행만, 콘텐츠는 admin만
--   카운터 — 직접 update 불가, 트리거/RPC로만
-- ============================================================

alter table public.profiles enable row level security;
alter table public.channels enable row level security;
alter table public.books enable row level security;
alter table public.posts enable row level security;
alter table public.post_cards enable row level security;
alter table public.post_videos enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.banned_words enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reading_progress enable row level security;
alter table public.view_logs enable row level security;
alter table public.featured_books enable row level security;

-- ------------------------------------------------------------
-- profiles: 닉네임/아바타는 공개(댓글 표시용), 수정은 본인만
-- ------------------------------------------------------------
create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');  -- 셀프 승격 방지

-- ------------------------------------------------------------
-- channels / books / featured_books: 공개 읽기, admin 쓰기
-- ------------------------------------------------------------
create policy "channels_select_all" on public.channels
  for select using (true);
create policy "channels_admin_write" on public.channels
  for all using (public.is_admin()) with check (public.is_admin());

create policy "books_select_all" on public.books
  for select using (true);
create policy "books_admin_write" on public.books
  for all using (public.is_admin()) with check (public.is_admin());

create policy "featured_select_all" on public.featured_books
  for select using (true);
create policy "featured_admin_write" on public.featured_books
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- posts / post_cards / post_videos: 발행분만 공개, admin 전체
-- ------------------------------------------------------------
create policy "posts_select_published" on public.posts
  for select using (status = 'published' or public.is_admin());
create policy "posts_admin_write" on public.posts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "post_cards_select_published" on public.post_cards
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and (p.status = 'published' or public.is_admin())
    )
  );
create policy "post_cards_admin_write" on public.post_cards
  for all using (public.is_admin()) with check (public.is_admin());

create policy "post_videos_select_published" on public.post_videos
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and (p.status = 'published' or public.is_admin())
    )
  );
create policy "post_videos_admin_write" on public.post_videos
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- likes: 내 좋아요 여부 확인은 본인 행만, 토글은 본인만
-- (총 개수는 posts.like_count 비정규화 값 사용)
-- ------------------------------------------------------------
create policy "likes_select_own" on public.likes
  for select using (auth.uid() = user_id);
create policy "likes_insert_own" on public.likes
  for insert with check (auth.uid() = user_id);
create policy "likes_delete_own" on public.likes
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- comments: 삭제 안 된 댓글 공개, 작성은 로그인, soft delete는 본인/관리자
-- ------------------------------------------------------------
create policy "comments_select_visible" on public.comments
  for select using (deleted_at is null or auth.uid() = user_id or public.is_admin());
create policy "comments_insert_own" on public.comments
  for insert with check (auth.uid() = user_id);
create policy "comments_soft_delete" on public.comments
  for update using (auth.uid() = user_id or public.is_admin());

-- ------------------------------------------------------------
-- reports: 로그인 사용자가 신고, 조회/처리는 admin만
-- ------------------------------------------------------------
create policy "reports_insert_auth" on public.reports
  for insert with check (auth.uid() = reporter_id);
create policy "reports_admin_all" on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

-- banned_words: admin 전용 (필터링은 security definer 트리거가 수행)
create policy "banned_words_admin" on public.banned_words
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- bookmarks / reading_progress: 본인 것만
-- ------------------------------------------------------------
create policy "bookmarks_own" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "progress_own" on public.reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- view_logs: 쓰기는 record_view RPC(security definer)만, 조회는 admin
-- ------------------------------------------------------------
create policy "view_logs_admin_select" on public.view_logs
  for select using (public.is_admin());

-- ============================================================
-- 스토리지 버킷
--   covers  (공개) — 도서 표지
--   videos  (공개) — 게시물 mp4
--   epubs   (비공개) — 서버가 signed URL 발급
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('covers', 'covers', true),
  ('videos', 'videos', true),
  ('epubs',  'epubs',  false)
on conflict (id) do nothing;

-- 공개 버킷 읽기
create policy "covers_public_read" on storage.objects
  for select using (bucket_id = 'covers');
create policy "videos_public_read" on storage.objects
  for select using (bucket_id = 'videos');

-- 업로드/수정/삭제는 admin만 (모든 버킷)
create policy "storage_admin_insert" on storage.objects
  for insert with check (
    bucket_id in ('covers', 'videos', 'epubs') and public.is_admin()
  );
create policy "storage_admin_update" on storage.objects
  for update using (
    bucket_id in ('covers', 'videos', 'epubs') and public.is_admin()
  );
create policy "storage_admin_delete" on storage.objects
  for delete using (
    bucket_id in ('covers', 'videos', 'epubs') and public.is_admin()
  );

-- epubs 읽기 정책 없음 (의도): 클라이언트 직접 접근 차단,
-- 서버(service role)가 접근 유형 검사 후 signed URL 발급
