-- ============================================================
-- 도서 트레일러 — 도서당 하나, post_videos와 같은 모양
-- 설계: docs/superpowers/specs/2026-09-12-book-trailer-design.md
-- ============================================================
create table public.book_trailers (
  book_id uuid primary key references public.books (id) on delete cascade,
  source_type text not null check (source_type in ('upload', 'youtube')),
  video_path text,           -- upload: fallback.mp4 공개 URL (이름과 달리 경로가 아니다 — post_videos와 같다)
  youtube_id text,           -- youtube
  duration_sec int,
  hls_path text,
  poster_path text,
  renditions jsonb,
  asset_group_id uuid references public.video_uploads (id),
  created_at timestamptz not null default now(),
  check (
    (source_type = 'upload' and video_path is not null)
    or (source_type = 'youtube' and youtube_id is not null)
  )
);
create index book_trailers_asset_group_idx on public.book_trailers (asset_group_id);

alter table public.book_trailers enable row level security;
-- 도서 자체가 공개 데이터다. 다음 단계(도서 시트 노출)가 anon으로 읽는다.
create policy book_trailers_select_all on public.book_trailers
  for select using (true);
create policy book_trailers_admin_write on public.book_trailers
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- 저장 RPC — save_video_post와 같은 규칙. 묶음은 서버가 ready로 확인한
-- 것만, 그리고 게시물·다른 트레일러 어디에도 붙지 않은 것만 연결한다.
-- ------------------------------------------------------------
create function public.save_book_trailer(
  p_book_id uuid, p_source text, p_youtube_id text default null, p_upload_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  bundle public.video_uploads;
  previous public.book_trailers;
begin
  if not public.is_admin() then raise exception '관리자만 저장할 수 있습니다'; end if;
  if p_source is null or p_source not in ('none', 'upload', 'youtube') then raise exception '잘못된 트레일러 소스'; end if;
  perform 1 from public.books where id = p_book_id for update;
  if not found then raise exception '도서를 찾지 못했습니다'; end if;
  select * into previous from public.book_trailers where book_id = p_book_id;

  if p_source = 'none' then
    delete from public.book_trailers where book_id = p_book_id;
    return;
  end if;

  if p_source = 'youtube' then
    if p_youtube_id is null or p_youtube_id !~ '^[a-zA-Z0-9_-]{11}$' then raise exception '잘못된 유튜브 ID'; end if;
    insert into public.book_trailers (book_id, source_type, youtube_id)
    values (p_book_id, 'youtube', p_youtube_id)
    on conflict (book_id) do update set source_type = 'youtube', youtube_id = excluded.youtube_id,
      video_path = null, hls_path = null, poster_path = null, duration_sec = null, renditions = null, asset_group_id = null;
    return;
  end if;

  -- upload
  if p_upload_id is null then
    if previous.source_type is distinct from 'upload' or previous.video_path is null then
      raise exception '영상 묶음을 업로드하세요';
    end if;
    return; -- 기존 영상 유지
  end if;
  select * into bundle from public.video_uploads where id = p_upload_id for update;
  if not found or bundle.status <> 'ready' then raise exception '업로드 검증이 완료되지 않았습니다'; end if;
  if exists (select 1 from public.post_videos where asset_group_id = p_upload_id) then
    raise exception '게시물에 연결된 영상입니다';
  end if;
  if exists (select 1 from public.book_trailers where asset_group_id = p_upload_id and book_id <> p_book_id) then
    raise exception '다른 도서의 트레일러에 연결된 영상입니다';
  end if;
  insert into public.book_trailers (book_id, source_type, video_path, hls_path, poster_path, duration_sec, renditions, asset_group_id)
  values (p_book_id, 'upload', bundle.public_base || '/fallback.mp4', bundle.public_base || '/master.m3u8',
    bundle.public_base || '/poster.jpg', ceil((bundle.manifest->>'duration')::numeric), bundle.manifest->'renditions', bundle.id)
  on conflict (book_id) do update set source_type = 'upload', youtube_id = null, video_path = excluded.video_path,
    hls_path = excluded.hls_path, poster_path = excluded.poster_path, duration_sec = excluded.duration_sec,
    renditions = excluded.renditions, asset_group_id = excluded.asset_group_id;
end;
$$;
revoke all on function public.save_book_trailer(uuid, text, text, uuid) from public, anon;
grant execute on function public.save_book_trailer(uuid, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 게시물 저장도 트레일러가 쓰는 묶음을 거부한다. 본문은 20260911000001과
-- 같고 검사 한 줄만 늘었다.
-- ------------------------------------------------------------
create or replace function public.save_video_post(
  p_id uuid, p_channel_id uuid, p_book_id uuid, p_publish boolean,
  p_source text, p_youtube_id text default null, p_upload_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(p_id, gen_random_uuid());
  bundle public.video_uploads;
  previous public.post_videos;
begin
  if not public.is_admin() then raise exception '관리자만 저장할 수 있습니다'; end if;
  if p_source is null or p_source not in ('upload', 'youtube') then raise exception '잘못된 영상 소스'; end if;
  if p_id is not null then
    perform 1 from public.posts where id = p_id and type = 'video' for update;
    if not found then raise exception '영상 게시물을 찾지 못했습니다'; end if;
    select * into previous from public.post_videos where post_id = target;
  end if;
  if p_source = 'youtube' and (p_youtube_id is null or p_youtube_id !~ '^[a-zA-Z0-9_-]{11}$') then
    raise exception '잘못된 유튜브 ID';
  end if;
  if p_source = 'upload' then
    if p_upload_id is not null then
      select * into bundle from public.video_uploads where id = p_upload_id for update;
      if not found or bundle.status <> 'ready' then raise exception '업로드 검증이 완료되지 않았습니다'; end if;
      if exists(select 1 from public.post_videos where asset_group_id = p_upload_id and post_id <> target) then
        raise exception '다른 게시물에 연결된 영상입니다';
      end if;
      if exists(select 1 from public.book_trailers where asset_group_id = p_upload_id) then
        raise exception '트레일러에 연결된 영상입니다';
      end if;
    elsif previous.source_type is distinct from 'upload' or previous.video_path is null then
      raise exception '영상 묶음을 업로드하세요';
    end if;
  end if;
  insert into public.posts (id, channel_id, book_id, type, status, published_at)
    values (target, p_channel_id, p_book_id, 'video', case when p_publish then 'published' else 'draft' end, case when p_publish then now() end)
  on conflict (id) do update set channel_id = excluded.channel_id, book_id = excluded.book_id,
    status = excluded.status, published_at = coalesce(posts.published_at, excluded.published_at);
  if p_source = 'youtube' then
    insert into public.post_videos(post_id, source_type, youtube_id) values(target, 'youtube', p_youtube_id)
    on conflict(post_id) do update set source_type = 'youtube', youtube_id = excluded.youtube_id,
      video_path = null, hls_path = null, poster_path = null, duration_sec = null, renditions = null, asset_group_id = null;
  elsif p_upload_id is not null then
    insert into public.post_videos(post_id, source_type, video_path, hls_path, poster_path, duration_sec, renditions, asset_group_id)
    values(target, 'upload', bundle.public_base || '/fallback.mp4', bundle.public_base || '/master.m3u8',
      bundle.public_base || '/poster.jpg', ceil((bundle.manifest->>'duration')::numeric), bundle.manifest->'renditions', bundle.id)
    on conflict(post_id) do update set source_type = 'upload', youtube_id = null, video_path = excluded.video_path,
      hls_path = excluded.hls_path, poster_path = excluded.poster_path, duration_sec = excluded.duration_sec,
      renditions = excluded.renditions, asset_group_id = excluded.asset_group_id;
  end if;
  return target;
end;
$$;

-- 정리 잠금도 트레일러 참조를 본다. 빠뜨리면 정리 화면이 트레일러 영상을 지운다.
create or replace function public.claim_video_cleanup(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.video_uploads where id = p_id for update;
  if not found then return false; end if;
  if exists(select 1 from public.post_videos where asset_group_id = p_id) then return false; end if;
  if exists(select 1 from public.book_trailers where asset_group_id = p_id) then return false; end if;
  update public.video_uploads set status = 'deleting' where id = p_id;
  return true;
end;
$$;
