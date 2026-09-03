-- ============================================================
-- 알림 (설계 결정 12~17)
--
-- 행을 트리거가 만드는 이유: 답글은 comments INSERT, 좋아요는
-- comment_likes INSERT로 서로 다른 경로다. 클라이언트가 만들면 한쪽
-- 경로에서 빠지고, 그때 알림이 "가끔 안 오는" 상태가 된다.
--
-- 대상 이벤트가 2종뿐인 이유: 이 앱은 UGC가 아니라 게시물을 어드민이
-- 만든다(MVP 비목표). 그래서 "내 게시물에 댓글/좋아요"는 받을 사람이
-- 없다. 남는 것은 내 댓글에 달린 답글과 내 댓글에 눌린 좋아요뿐이다.
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('reply', 'comment_like')),
  -- 알림의 대상 댓글. 답글이면 그 답글, 좋아요면 좋아요받은 댓글.
  comment_id uuid not null references public.comments (id) on delete cascade,
  -- 딥링크용. comment_id로 유도할 수도 있지만 조인 없이 URL을 만들려고 둔다.
  post_id uuid not null references public.posts (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- 목록은 항상 "내 알림을 최신순으로"다.
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

-- 받은 사람만 읽고, 받은 사람만 읽음 처리한다.
-- insert 정책이 없는 이유: 행은 security definer 트리거만 만든다.
-- 정책을 열어두면 클라이언트가 남에게 알림을 보낼 수 있다.
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = recipient_id);
create policy "notifications_update_own" on public.notifications
  for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- read_at 외의 컬럼을 클라이언트가 바꾸지 못하게 한다.
-- 2단계에서 배운 것: RLS는 UPDATE가 어떤 컬럼을 건드리는지 제한하지
-- 못하고, Supabase 기본 권한이 테이블 단위 UPDATE를 이미 부여해 두므로
-- 컬럼 단위 revoke만으로는 걷히지 않는다(§11-45). 테이블 단위를 걷고
-- 필요한 컬럼만 다시 준다.
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

-- ------------------------------------------------------------
-- 답글 알림. 부모 댓글 작성자에게 보낸다.
--
-- 본인이 본인에게 다는 답글은 만들지 않는다 — 알림함이 자기 글로
-- 채워지면 배지가 신호가 아니라 소음이 된다.
-- ------------------------------------------------------------
create function public.notify_on_reply()
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
  -- notify_on_comment_like와 대칭으로 삭제된 부모는 걸러낸다. 오늘은
  -- flatten_comment_depth(20260902000001)가 PARENT_DELETED로 삽입 자체를
  -- 막아 이 트리거가 실행될 일이 없지만, 그건 다른 마이그레이션이 우연히
  -- 세워준 방어막일 뿐이다. 이 트리거 스스로도 방어해야 두 알림 트리거가
  -- 대칭을 이루고, 이 파일만 보고도 정확성을 확인할 수 있다.
  if not found or v_parent.user_id = new.user_id or v_parent.deleted_at is not null then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, type, comment_id, post_id)
  values
    (v_parent.user_id, new.user_id, 'reply', new.id, new.post_id);

  return new;
end;
$fn$;

create trigger on_reply_notify
  after insert on public.comments
  for each row execute function public.notify_on_reply();

-- 좋아요 알림은 (수신자, 행위자, 댓글) 조합마다 하나만 있으면 된다.
-- 좋아요는 취소해도 알림 행을 지우지 않으므로(아래), 같은 사람이
-- 좋아요→취소→재좋아요를 반복하면 트리거가 매번 새 행을 넣으려 든다.
-- 목록 UI는 행위자 이름을 중복 제거해서 보여주니 눈에는 안 띄지만,
-- 안 읽은 개수 배지는 행 수를 그대로 세므로 재좋아요 한 번마다
-- 배지가 부풀어 사용자가 배지를 못 믿게 된다. 답글 타입은 이 제약에서
-- 뺀다 — 같은 사람이 같은 댓글에 단 서로 다른 답글은 서로 다른 사건이라
-- 둘 다 알려야 하기 때문에, 부분 유니크 인덱스로 comment_like에만 건다.
create unique index notifications_comment_like_unique
  on public.notifications (recipient_id, actor_id, comment_id)
  where type = 'comment_like';

-- ------------------------------------------------------------
-- 좋아요 알림. 댓글 작성자에게 보낸다.
--
-- 삭제된 댓글에는 만들지 않는다 — 눌러도 갈 곳이 없다.
-- 좋아요를 취소해도 알림은 지우지 않는다: 이미 읽은 알림이 사라지면
-- 목록이 과거를 다시 쓰는 것처럼 보인다.
-- ------------------------------------------------------------
create function public.notify_on_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_comment public.comments%rowtype;
begin
  select * into v_comment from public.comments where id = new.comment_id;
  if not found
     or v_comment.deleted_at is not null
     or v_comment.user_id = new.user_id then
    return new;
  end if;

  -- 재좋아요는 조용히 흡수한다: 위 유니크 인덱스에 걸리면 이 INSERT는
  -- 아무 것도 하지 않고 넘어간다 — 취소해도 알림이 안 지워지는 정책과
  -- 합쳐지면, "그 사람의 첫 좋아요만 알린다"는 뜻이 된다. 두 번째
  -- 좋아요부터는 이미 (읽었을 수도 있는) 알림이 있으니 새로 만들 것이 없다.
  insert into public.notifications
    (recipient_id, actor_id, type, comment_id, post_id)
  values
    (v_comment.user_id, new.user_id, 'comment_like', v_comment.id, v_comment.post_id)
  on conflict (recipient_id, actor_id, comment_id) where type = 'comment_like'
    do nothing;

  return new;
end;
$fn$;

create trigger on_comment_like_notify
  after insert on public.comment_likes
  for each row execute function public.notify_on_comment_like();
