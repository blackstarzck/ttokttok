-- ============================================================
-- 대댓글 — 1단 고정
-- 설계: docs/superpowers/specs/2026-09-02-comment-threads-design.md (결정 2·6)
--
-- 깊이를 DB가 강제하는 이유: 답글 행에도 "답글" 버튼이 있으므로(결정 8)
-- 클라이언트가 parent_id를 잘못 넣으면 3단이 생긴다. 데이터가 한번
-- 깊어지면 되돌리는 마이그레이션이 훨씬 비싸다.
--
-- 연쇄 숨김을 DB가 하는 이유: 사용자 삭제(removeComment)와 어드민 삭제
-- (deleteReportedComment)가 서로 다른 경로인데, 규칙이 한 곳에만 있으면
-- 다른 쪽에서 고아 답글이 남는다. 신고당한 부모만 지우고 답글이 남으면
-- 모더레이션이 무의미하다.
-- ============================================================

alter table public.comments
  add column parent_id uuid references public.comments (id) on delete cascade;

-- 답글 조회: 부모별 오래된 순 (결정 4)
create index comments_parent_idx
  on public.comments (parent_id, created_at)
  where parent_id is not null;

-- 최상위 키셋 커서: (created_at desc, id desc) (결정 9)
create index comments_post_root_idx
  on public.comments (post_id, created_at desc, id desc)
  where parent_id is null;

-- ------------------------------------------------------------
-- 1단 강제. 부모가 이미 답글이면 조부모로 되돌린다 —
-- 인스타·유튜브가 하는 flatten과 같은 동작이다.
-- 다른 게시물의 댓글을 부모로 지정하는 것도 여기서 막는다.
-- ------------------------------------------------------------
create function public.flatten_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_parent public.comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from public.comments where id = new.parent_id;

  if not found then
    raise exception 'PARENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_parent.post_id <> new.post_id then
    raise exception 'PARENT_POST_MISMATCH' using errcode = 'P0001';
  end if;

  -- 부모가 답글이면 그 부모(= 최상위)로 올린다.
  if v_parent.parent_id is not null then
    new.parent_id := v_parent.parent_id;
  end if;

  return new;
end;
$fn$;

create trigger on_comment_flatten_depth
  before insert on public.comments
  for each row execute function public.flatten_comment_depth();

-- ------------------------------------------------------------
-- 연쇄 숨김. 최상위 댓글이 soft delete되면 살아 있는 답글도 함께 숨긴다.
-- 답글 행마다 UPDATE가 나가므로 기존 sync_comment_count가 행마다 발동해
-- comment_count가 저절로 맞는다 — 카운터를 직접 건드리지 않는다.
--
-- 재귀 방지: parent_id가 NULL인 행(= 최상위)일 때만 연쇄한다. 답글의
-- UPDATE로 이 트리거가 다시 돌아도 즉시 빠져나간다.
--
-- 복구(deleted_at → NULL)는 연쇄하지 않는다. 되살리는 UI가 없고,
-- 연쇄 복구는 "부모와 무관하게 따로 지워진 답글"까지 되살려 버린다.
-- ------------------------------------------------------------
create function public.cascade_comment_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.parent_id is not null then
    return new;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    update public.comments
       set deleted_at = new.deleted_at
     where parent_id = new.id
       and deleted_at is null;
  end if;

  return new;
end;
$fn$;

create trigger on_comment_cascade_delete
  after update of deleted_at on public.comments
  for each row execute function public.cascade_comment_delete();
