-- ============================================================
-- 정렬 RPC에 게시물 유형 필터 (IA 개편 결정 1·12)
--
-- 홈은 type='cards', 릴스는 type='video'만 본다. 두 화면이 같은 규칙으로
-- 각자 유형 안에서 정렬되도록, 정렬 로직은 그대로 두고 필터만 더한다.
--
-- p_type이 널이면 지금처럼 전 유형을 섞는다. 개편이 단계적으로 진행되는
-- 동안 홈이 기존 동작을 그대로 유지해야 하기 때문이다. 널일 때 weights는
-- 이전과 완전히 동일한 집합이므로, 홈의 순서는 한 톨도 바뀌지 않는다.
--
-- 새 이름으로 만들고 v3를 지우는 이유: 기본값 있는 인자를 덧붙이면
-- 교체가 아니라 오버로드가 된다. PostgREST는 RPC를 이름 인자로 부르므로
-- 5개 이름으로 호출하면 5인자·6인자 양쪽에 맞아 PGRST203(모호한 함수)이
-- 난다. 20260828000001이 v2를 지우고 v3를 만든 것과 같은 처리다.
--
-- 중앙값(baseline)이 필터 안쪽에서 계산되는 것은 의도한 바다 — 영상은
-- 영상들 사이의 중앙값과 비교돼야 한다. 유형별로 조회 규모가 다른데
-- 전체 중앙값을 쓰면 한쪽이 통째로 면제받거나 통째로 벌을 받는다.
-- ============================================================

create function public.get_feed_v4(
  p_seed text,
  p_session_id text default null,
  p_limit int default 10,
  p_cursor text default null,
  p_cursor_id uuid default null,
  p_type text default null
)
returns table (
  id uuid,
  cursor_token text
)
language sql
security definer
set search_path = public
set extra_float_digits = 3
stable
as $$
  with weights as (
    select
      p.id,
      p.published_at,
      p.view_count,
      -- [1, 3]으로 압축된 인기 가중 (조회는 좋아요보다 가볍게)
      1 + least(ln(1 + p.like_count + p.view_count * 0.1) / 4, 2) as popularity
    from public.posts p
    where p.status = 'published'
      and (p_type is null or p.type = p_type)
  ),
  baseline as (
    select percentile_cont(0.5) within group (order by popularity) as median
    from weights
  )
  select s.id, s.score::text
  from (
    select
      w.id,
      (
        -- [0,1) 결정적 난수 — 같은 seed면 순서가 재현된다
        (abs(hashtextextended(w.id::text || p_seed, 0) % 1000000000) / 1000000000.0)
        -- 인기 가중. 아직 평가할 만큼 노출되지 않은 글은 면제한다.
        * (case
             when w.view_count < 50
               then greatest(w.popularity, (select median from baseline))
             else w.popularity
           end)
        -- 신선도: 발행 7일 이내 보정
        * (case when w.published_at > now() - interval '7 days' then 1.5 else 1.0 end)
        -- 이미 본 글은 뒤로. 아예 빼지는 않는다 — 콘텐츠가 적을 때
        -- 피드가 비어 버리기 때문.
        * (case
             when p_session_id is not null and exists (
               select 1 from public.view_logs vl
               where vl.post_id = w.id
                 and vl.session_id = p_session_id
                 and vl.created_at > now() - interval '3 days'
             ) then 0.25
             else 1.0
           end)
      )::double precision as score
    from weights w
  ) s
  -- 정렬이 (score desc, id asc)이므로 다음 페이지는 그 뒤에 오는 것들이다.
  where p_cursor is null
     or s.score < p_cursor::double precision
     or (s.score = p_cursor::double precision and s.id > p_cursor_id)
  order by s.score desc, s.id
  limit greatest(p_limit, 0);
$$;

-- 옛 함수를 남기면 오버로드 모호성이 생긴다(위 주석).
drop function public.get_feed_v3(text, text, int, text, uuid);
