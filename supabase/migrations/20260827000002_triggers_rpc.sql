-- ============================================================
-- 트리거 + RPC: 카운터 비정규화, 금칙어 필터, 조회/공유 로깅
-- ============================================================

-- ------------------------------------------------------------
-- 좋아요 카운터
-- ------------------------------------------------------------
create function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_like_change
  after insert or delete on public.likes
  for each row execute function public.sync_like_count();

-- ------------------------------------------------------------
-- 댓글 카운터 (soft delete 반영: deleted_at이 찍히면 감소)
-- ------------------------------------------------------------
create function public.sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.posts set comment_count = greatest(comment_count - 1, 0) where id = new.post_id;
    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    end if;
    return new;
  end if;
  return null;
end;
$$;

create trigger on_comment_change
  after insert or delete or update of deleted_at on public.comments
  for each row execute function public.sync_comment_count();

-- ------------------------------------------------------------
-- 금칙어 필터 (댓글 등록 시점 차단)
-- ------------------------------------------------------------
create function public.check_banned_words()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.banned_words
    where new.content ilike '%' || word || '%'
  ) then
    raise exception 'BANNED_WORD' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger on_comment_check_banned
  before insert on public.comments
  for each row execute function public.check_banned_words();

-- ------------------------------------------------------------
-- 조회 기록 RPC (게스트 포함 — 뷰포트 1초 노출 시 클라이언트가 호출)
-- 같은 세션이 같은 게시물을 10분 내 재조회하면 중복 집계하지 않는다.
-- ------------------------------------------------------------
create function public.record_view(p_post_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.view_logs
    where post_id = p_post_id
      and session_id = p_session_id
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into public.view_logs (post_id, user_id, session_id)
  values (p_post_id, auth.uid(), p_session_id);

  update public.posts set view_count = view_count + 1 where id = p_post_id;
end;
$$;

grant execute on function public.record_view(uuid, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 공유 기록 RPC (공유 버튼 탭 시)
-- ------------------------------------------------------------
create function public.record_share(p_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts set share_count = share_count + 1 where id = p_post_id;
$$;

grant execute on function public.record_share(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- reading_progress.updated_at 자동 갱신
-- ------------------------------------------------------------
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_progress_touch
  before update on public.reading_progress
  for each row execute function public.touch_updated_at();
