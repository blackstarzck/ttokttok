-- ============================================================
-- 답글 알림 수신자 교정
--
-- flatten_comment_depth(20260902000001)는 BEFORE INSERT라 답글의 답글이
-- 오면 new.parent_id를 조부모(= 루트)로 덮어쓴다. notify_on_reply
-- (20260903000002)는 AFTER INSERT라 그 시점엔 이미 new.parent_id가
-- 루트다 — 그래서 B의 댓글에 단 C의 답글이 B가 아니라 루트 작성자 A에게
-- 간다. A는 자기가 낀 적 없는 대화의 알림을 전부 받고, 정작 지목된 B는
-- 아무것도 못 받는다.
--
-- 고치는 방법은 "누구를 향한 답글이었는지"를 평탄화 직전에 적어 두는
-- 것뿐이다 — 그 순간이 유일하게 원래 부모(v_parent, 곧 B)를 손에 쥐고
-- 있는 때이고, 그 다음 줄에서 new.parent_id를 덮어쓰면 정보가 사라진다.
-- ============================================================

-- reply_target_id: 답글이 실제로 겨냥한 댓글. 평탄화가 일어났을 때만
-- 채워진다 — 루트에 바로 단 답글은 new.parent_id 자체가 이미 정확한
-- 대상이라 따로 적을 게 없다(아래 두 함수 참고).
--
-- on delete set null인 이유: parent_id처럼 on delete cascade를 쓰면 겨냥
-- 당한 댓글이 사라질 때 그걸 겨냥한 답글까지 지워진다 — 이 컬럼은 트리
-- 구조가 아니라 "누구에게 알릴지"를 위한 부가 정보일 뿐이라, 대상이
-- 사라져도 답글 자체는 남아야 한다. (오늘은 댓글이 개별 하드 삭제되지
-- 않고 posts 하드 삭제로만 함께 사라지므로 실제로 이 경로를 타는 행은
-- 같은 트랜잭션에서 함께 지워지지만, 제약의 뜻은 이래야 맞다.)
alter table public.comments
  add column reply_target_id uuid references public.comments (id) on delete set null;

-- ------------------------------------------------------------
-- 컬럼 권한 메모: comment_likes(20260903000001)에서 이미 UPDATE는
-- 테이블 단위로 revoke하고 deleted_at 하나만 다시 grant했다 — RLS가
-- UPDATE의 대상 컬럼을 못 가리므로, 새 컬럼도 별도 grant 없이는 UPDATE로
-- 못 건드린다(추가 조치 불필요, fail-closed가 기본).
--
-- INSERT는 다르다: comments_insert_own(20260827000003)의 with check는
-- `auth.uid() = user_id`뿐이고, 테이블 단위 INSERT 권한은 컬럼을 가리지
-- 않는다 — 그래서 클라이언트가 POST 페이로드에 reply_target_id를 직접
-- 실어 보내면(예: 실제로는 루트에 바로 단 답글이면서 reply_target_id만
-- 아무 남의 댓글 id로 채워서), 이 트리거가 그 값을 그대로 두면 알림이
-- 위조된다. INSERT 컬럼 grant/revoke로 막는 대신 아래 flatten_comment_depth
-- 자체가 매 INSERT마다 reply_target_id를 처음부터 다시 계산해 클라이언트
-- 입력을 무조건 덮어쓰게 했다 — BEFORE INSERT 트리거가 이미 이 컬럼의
-- 유일한 쓰기 경로이므로 별도 revoke가 필요 없다.
-- ------------------------------------------------------------

create or replace function public.flatten_comment_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_parent public.comments%rowtype;
begin
  -- 클라이언트가 뭘 보냈든 여기서 무조건 다시 계산한다 — 이 값의 유일한
  -- 쓰기 경로가 이 트리거이어야 위 위조 시나리오가 막힌다.
  new.reply_target_id := null;

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

  -- 삭제된 부모에 붙은 답글은 UI에서 영영 도달할 수 없는데 카운터만 올린다.
  if v_parent.deleted_at is not null then
    raise exception 'PARENT_DELETED' using errcode = 'P0001';
  end if;

  -- 부모가 답글이면 그 부모(= 최상위)로 올린다. 덮어쓰기 전에, 지금
  -- v_parent에 들어 있는 원래 대상(B)을 reply_target_id에 적어 둔다 —
  -- 이 줄 다음에는 new.parent_id가 루트로 바뀌어 더는 알 수 없다.
  if v_parent.parent_id is not null then
    new.reply_target_id := v_parent.id;
    new.parent_id := v_parent.parent_id;
  end if;

  return new;
end;
$fn$;

-- ------------------------------------------------------------
-- 답글 알림 수신자를 교정한다. reply_target_id가 있으면(= 평탄화가
-- 일어났으면) 그 원래 대상의 작성자에게, 없으면(= 루트에 바로 단 답글)
-- 기존처럼 parent_id(루트)의 작성자에게 보낸다.
--
-- 가드는 기존과 동일한 뜻을 유지한다: 본인이 본인에게 다는 답글은
-- 만들지 않고(자기 글로 알림함이 채워지면 배지가 소음이 된다), 삭제된
-- 대상에는 보내지 않는다(눌러도 갈 곳이 없다). 대상만 parent_id에서
-- reply_target_id 우선으로 바뀌었을 뿐, comment_id는 여전히 새로 달린
-- 답글(new.id)을 가리켜 딥링크는 그대로 그 답글로 간다.
-- ------------------------------------------------------------

create or replace function public.notify_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_target public.comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.reply_target_id is not null then
    select * into v_target from public.comments where id = new.reply_target_id;
  else
    select * into v_target from public.comments where id = new.parent_id;
  end if;

  -- notify_on_comment_like와 대칭으로 삭제된 대상은 걸러낸다. 오늘은
  -- flatten_comment_depth가 PARENT_DELETED로 삽입 자체를 막아 이 트리거가
  -- 실행될 일이 없지만, 그건 다른 마이그레이션이 우연히 세워준 방어막일
  -- 뿐이다. 이 트리거 스스로도 방어해야 두 알림 트리거가 대칭을 이루고,
  -- 이 파일만 보고도 정확성을 확인할 수 있다.
  if not found or v_target.user_id = new.user_id or v_target.deleted_at is not null then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, actor_id, type, comment_id, post_id)
  values
    (v_target.user_id, new.user_id, 'reply', new.id, new.post_id);

  return new;
end;
$fn$;
