-- Upload records are retained until explicitly cleaned, including abandoned uploads.
create table public.video_uploads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'deleting')),
  manifest jsonb not null,
  public_base text not null
);
alter table public.video_uploads enable row level security;
create policy video_uploads_admin_read on public.video_uploads for select to authenticated using (public.is_admin());
-- The server creates/verifies these records. A browser cannot claim an upload is ready.
revoke all on public.video_uploads from anon, authenticated;
grant select on public.video_uploads to authenticated;

alter table public.post_videos
  add column hls_path text,
  add column poster_path text,
  add column renditions jsonb,
  add column asset_group_id uuid references public.video_uploads(id);
create index post_videos_asset_group_idx on public.post_videos(asset_group_id);

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
revoke all on function public.save_video_post(uuid,uuid,uuid,boolean,text,text,uuid) from public, anon;
grant execute on function public.save_video_post(uuid,uuid,uuid,boolean,text,text,uuid) to authenticated;

-- Serializes cleanup with attachment. Only the server calls this before deleting storage files.
create function public.claim_video_cleanup(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.video_uploads where id = p_id for update;
  if not found then return false; end if;
  if exists(select 1 from public.post_videos where asset_group_id = p_id) then return false; end if;
  update public.video_uploads set status = 'deleting' where id = p_id;
  return true;
end;
$$;
revoke all on function public.claim_video_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.claim_video_cleanup(uuid) to service_role;

-- A cancelled request must not recreate an orphan after cleanup, or overwrite a ready bundle.
-- The row lock lasts until Storage's metadata transaction finishes and serializes with cleanup.
create function public.can_write_video_bundle(object_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare bundle_id uuid; bundle_status text;
begin
  if not public.is_admin() then return false; end if;
  if object_name !~ '^bundles/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then return false; end if;
  bundle_id := split_part(object_name, '/', 2)::uuid;
  select status into bundle_status from public.video_uploads where id = bundle_id for share;
  return coalesce(bundle_status = 'uploading', false);
end;
$$;
revoke all on function public.can_write_video_bundle(text) from public, anon;
grant execute on function public.can_write_video_bundle(text) to authenticated;

create policy video_bundle_insert_guard on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'videos' or name not like 'bundles/%' or public.can_write_video_bundle(name));
create policy video_bundle_update_guard on storage.objects as restrictive for update to authenticated
with check (bucket_id <> 'videos' or name not like 'bundles/%' or public.can_write_video_bundle(name));
