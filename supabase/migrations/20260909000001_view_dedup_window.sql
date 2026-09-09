-- ============================================================
-- record_view의 중복 제거 창을 10분 → 24시간으로 넓힌다
--
-- 10분은 "스크롤을 위아래로 흔드는 것"만 걸렀다. 같은 사람이 하루에
-- 여러 번 들어오면 그때마다 조회로 잡혔고, 급상승 그리드는 그 원시
-- 조회수를 그대로 정렬해 숫자까지 노출한다(get_trending_posts는
-- view_logs 행을 count(*)로 센다). 게시물이 열 몇 개인 지금은 한 사람의
-- 재방문만으로 순위가 뒤집힌다.
--
-- 운영 데이터 실측(2026-09-09, view_logs 182행):
--   고유 (게시물, 세션) 쌍      66개   → 팽창률 2.76배
--   한 쌍의 최대 반복           18회
--   창을 바꿨을 때 남는 행:
--     10분(현재)  181   ← 사실상 아무것도 거르지 못한다
--     1시간       148
--     6시간       108
--     24시간       90
--     세션당 1회   66   (이론적 하한)
--
-- 24시간을 고른 이유: 대부분의 부풀림을 잡으면서 **다른 날 다시 온 것은
-- 진짜 조회로 남긴다.** 7일 급상승 창과 맞물리면 한 사람이 한 게시물에
-- 기여할 수 있는 최대치가 7이 되어, 지표가 "며칠에 걸쳐 몇 명이 봤나"에
-- 가까워진다. 세션당 1회로 더 조이면 2주 뒤 다시 찾아온 것도 안 세는데,
-- 그건 조회가 아니라 "고유 방문자"라 다른 지표다.
--
-- **바꾸지 않은 것 두 가지 — 둘 다 다른 코드가 기대고 있다:**
--
-- 1) analytics_events는 여전히 중복 제거 없이 매 호출을 남긴다. 그 표가
--    "무엇이 제출됐는가"의 완전한 원장이라, 조회 집계가 실제로 돌았는지를
--    검증할 때 유일하게 믿을 수 있는 근거다(IA 개편 4단계에서 실제로 이걸로
--    "마운트만 되고 화면에 안 보인 게시물은 한 번도 제출되지 않았음"을
--    증명했다).
--
-- 2) view_logs INSERT와 view_count 증가는 **같은 분기**에 남는다. 둘이
--    1:1로 움직인다는 사실에 get_feed_v4의 점수 고정이 기대고 있다 —
--    as_of 이후의 view_logs 행 수를 빼서 그 시점의 view_count를 복원하는데
--    (20260907000001), 한쪽만 움직이면 그 복원이 조용히 틀린다.
--
-- 기존 데이터는 손대지 않는다. 급상승은 7일 창이라 지난 행이 빠지면서
-- 저절로 정상화되지만, 누적 view_count에 이미 들어간 부풀림은 남는다 —
-- 되돌리려면 view_logs에서 재계산해야 하는데 시드가 하드코딩으로 넣은
-- 초기값(scripts/seed.mjs)까지 함께 지워진다.
-- ============================================================

create or replace function public.record_view(p_post_id uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 깔때기 원장에는 중복 제거 없이 남긴다 (위 주석 1).
  insert into public.analytics_events (event, user_id, session_id, post_id)
  values ('post_view', auth.uid(), p_session_id, p_post_id);

  -- 카운터는 같은 세션이 24시간 안에 다시 본 것을 세지 않는다.
  if exists (
    select 1 from public.view_logs
    where post_id = p_post_id
      and session_id = p_session_id
      and created_at > now() - interval '24 hours'
  ) then
    return;
  end if;

  -- 아래 두 문장은 반드시 함께 돈다 (위 주석 2).
  insert into public.view_logs (post_id, user_id, session_id)
  values (p_post_id, auth.uid(), p_session_id);

  update public.posts set view_count = view_count + 1 where id = p_post_id;
end;
$$;
