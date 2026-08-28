-- ============================================================
-- 분석 이벤트 (PRD §7)
--
-- view_logs와 역할이 다르다:
--   view_logs        — 조회수 카운터·급상승의 원천. 10분 중복 방지가 걸린다.
--   analytics_events — 깔때기 분석용 원장. 중복 제거 없이 일어난 대로 쌓는다.
--
-- 링크형 도서 깔때기(post_view → book_sheet_open → purchase_link_click)와
-- 전문 도서 깔때기(post_view → reader_open → book_complete)를 같은 표에서
-- 세려면 이벤트가 한 곳에 모여 있어야 한다 (결정 기록 §11-32).
-- ============================================================

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event text not null,
  user_id uuid references public.profiles (id) on delete set null,
  session_id text,                 -- 게스트 식별 (localStorage UUID)
  post_id uuid references public.posts (id) on delete set null,
  book_id uuid references public.books (id) on delete set null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index analytics_events_funnel_idx
  on public.analytics_events (event, created_at desc);
create index analytics_events_session_idx
  on public.analytics_events (session_id, created_at desc);

alter table public.analytics_events enable row level security;

-- 읽기는 관리자만. 쓰기는 아래 RPC로만 (직접 insert 정책을 두지 않는다 —
-- 임의 event 문자열을 아무나 넣는 통로를 열지 않기 위함).
create policy "analytics_admin_select" on public.analytics_events
  for select using (public.is_admin());

/**
 * 이벤트 기록.
 *
 * security definer인 이유: 게스트도 남겨야 하는데 insert 정책을 열면
 * 그 표에 아무 값이나 넣을 수 있게 된다. 허용 이벤트 이름을 여기서
 * 검사하고, 통과한 것만 들어간다.
 */
create function public.track_event(
  p_event text,
  p_session_id text default null,
  p_post_id uuid default null,
  p_book_id uuid default null,
  p_props jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event not in (
    'post_view', 'reader_open', 'reader_progress', 'book_complete',
    'like', 'comment', 'share', 'book_sheet_open', 'purchase_link_click'
  ) then
    raise exception 'UNKNOWN_EVENT: %', p_event;
  end if;

  insert into public.analytics_events
    (event, user_id, session_id, post_id, book_id, props)
  values
    (p_event, auth.uid(), p_session_id, p_post_id, p_book_id,
     coalesce(p_props, '{}'::jsonb));
end;
$$;

grant execute on function
  public.track_event(text, text, uuid, uuid, jsonb) to anon, authenticated;

-- 조회는 이미 record_view가 처리한다. 같은 호출에서 분석 이벤트도 남겨
-- 클라이언트가 두 번 왕복하지 않게 한다.
create or replace function public.record_view(p_post_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 깔때기 원장에는 중복 제거 없이 남긴다.
  insert into public.analytics_events (event, user_id, session_id, post_id)
  values ('post_view', auth.uid(), p_session_id, p_post_id);

  -- 카운터는 같은 세션 10분 내 재조회를 세지 않는다.
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
