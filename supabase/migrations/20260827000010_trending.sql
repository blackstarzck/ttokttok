-- ============================================================
-- 급상승 집계 (PRD §5.6-4 "최근 7일 조회수 상위")
--
-- 그동안은 posts.view_count(누적)로 정렬했다. 누적은 오래된 인기글이
-- 영원히 상단을 차지해 "급상승"이라는 말과 맞지 않는다.
--
-- security definer인 이유: view_logs는 관리자만 select할 수 있다(§6 RLS).
-- 호출자 권한으로는 집계가 늘 0이 된다. 대신 이 함수는 published 게시물의
-- id와 기간 조회수만 돌려주므로 공개 범위를 넘지 않는다.
-- ============================================================

create function public.get_trending_posts(
  p_days int default 7,
  p_limit int default 12
)
returns table (
  post_id uuid,
  recent_views bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    vl.post_id,
    count(*) as recent_views
  from public.view_logs vl
  join public.posts p on p.id = vl.post_id
  where p.status = 'published'
    and vl.created_at > now() - (greatest(p_days, 1) || ' days')::interval
  group by vl.post_id
  order by recent_views desc, vl.post_id
  limit greatest(p_limit, 0);
$$;

grant execute on function public.get_trending_posts(int, int) to anon, authenticated;
