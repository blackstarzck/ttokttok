-- ============================================================
-- 댓글 좋아요 (설계 결정 11)
--
-- 게시물 좋아요(likes / sync_like_count / likes_select_own)의 규약을
-- 그대로 복제한다. 두 좋아요가 다른 모양이면 나중에 한쪽만 고쳐진다.
--
-- 답글에도 붙는다 — comment_likes는 comments를 가리킬 뿐 최상위인지
-- 답글인지 구분하지 않는다.
-- ============================================================

alter table public.comments
  add column like_count int not null default 0;

create table public.comment_likes (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  comment_id uuid not null
    references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- "이 페이지의 댓글들 중 내가 누른 것"을 한 번에 조회한다.
-- PK가 (user_id, comment_id)라 user_id 고정 + comment_id IN (...) 을 그대로 받는다.
-- 별도 인덱스를 만들지 않는 이유가 이것이다.

alter table public.comment_likes enable row level security;

-- likes와 같은 형태: 내 좋아요 여부 확인은 본인 행만, 토글도 본인만.
-- 남의 좋아요를 셀 필요가 없다 — 총계는 like_count가 답한다.
create policy "comment_likes_select_own" on public.comment_likes
  for select using (auth.uid() = user_id);
create policy "comment_likes_insert_own" on public.comment_likes
  for insert with check (auth.uid() = user_id);
create policy "comment_likes_delete_own" on public.comment_likes
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 카운터. sync_like_count와 같은 구조다.
-- security definer인 이유: 좋아요를 누른 사람이 comments를 update할
-- 권한은 없다(comments_soft_delete는 본인 댓글만). 카운터는 트리거만이
-- 올리고 내린다.
-- ------------------------------------------------------------
create function public.sync_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'INSERT' then
    update public.comments
       set like_count = like_count + 1
     where id = new.comment_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.comments
       set like_count = greatest(like_count - 1, 0)
     where id = old.comment_id;
    return old;
  end if;
  return null;
end;
$fn$;

create trigger on_comment_like_change
  after insert or delete on public.comment_likes
  for each row execute function public.sync_comment_like_count();
