-- ============================================================
-- 홈 피드 정렬 RPC (PRD §5.1 가중 랜덤 + 인기)
--
--   score = random × (1 + ln(1 + like + view×0.1)) × freshness
--
-- random은 setseed() 대신 (post_id + seed) 해시로 만든다.
-- 커넥션 풀링 환경에서 세션 상태에 기대지 않고, 같은 seed면 같은 순서가
-- 재현되므로 페이지네이션이 어긋나지 않는다.
--
-- security definer가 아니다 — 호출자 권한으로 돌아 posts의 RLS가 그대로 적용된다.
-- ============================================================

create function public.get_feed(
  p_seed text,
  p_limit int default 10,
  p_offset int default 0
)
returns setof public.posts
language sql
stable
as $$
  select p.*
  from public.posts p
  where p.status = 'published'
  order by
    -- [0,1) 결정적 난수
    (abs(hashtextextended(p.id::text || p_seed, 0) % 1000000000) / 1000000000.0)
    -- 인기 가중 (조회수는 좋아요보다 가볍게)
    * (1 + ln(1 + p.like_count + p.view_count * 0.1))
    -- 신선도: 발행 7일 이내 보정
    * (case when p.published_at > now() - interval '7 days' then 1.5 else 1.0 end)
    desc,
    p.id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_feed(text, int, int) to anon, authenticated;
