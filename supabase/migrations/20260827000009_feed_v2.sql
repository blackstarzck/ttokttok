-- ============================================================
-- 피드 정렬 고도화 (PRD §5.1의 미구현 조항)
--
-- 기존 get_feed에 두 가지를 더한다:
--   1. 세션 내 이미 본 게시물은 후순위
--   2. offset 대신 커서 — 사이에 새 글이 발행돼도 페이지가 밀리지 않는다
--
-- security definer인 이유: 이미 봤는지 판정하려면 view_logs를 읽어야
-- 하는데, 그 표는 관리자만 select할 수 있다(§6 RLS). 호출자 권한으로는
-- EXISTS가 늘 거짓이 되어 후순위가 동작하지 않는다.
-- 대신 이 함수는 status='published'만 돌려주므로 posts의 공개 범위를
-- 넘지 않는다 — RLS를 우회해도 드러나는 정보가 같다.
-- ============================================================

create function public.get_feed_v2(
  p_seed text,
  p_session_id text default null,
  p_limit int default 10,
  p_cursor double precision default null
)
returns table (
  id uuid,
  score double precision
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    (
      -- [0,1) 결정적 난수 — 같은 seed면 순서가 재현된다
      (abs(hashtextextended(p.id::text || p_seed, 0) % 1000000000) / 1000000000.0)
      -- 인기 가중 (조회수는 좋아요보다 가볍게)
      * (1 + ln(1 + p.like_count + p.view_count * 0.1))
      -- 신선도: 발행 7일 이내 보정
      * (case when p.published_at > now() - interval '7 days' then 1.5 else 1.0 end)
      -- 이미 본 글은 뒤로. 아예 빼지는 않는다 — 콘텐츠가 적을 때
      -- 피드가 비어 버리기 때문.
      * (case
           when p_session_id is not null and exists (
             select 1 from public.view_logs vl
             where vl.post_id = p.id
               and vl.session_id = p_session_id
               and vl.created_at > now() - interval '3 days'
           ) then 0.25
           else 1.0
         end)
    )::double precision as score
  from public.posts p
  where p.status = 'published'
    and (
      p_cursor is null
      or (
        (abs(hashtextextended(p.id::text || p_seed, 0) % 1000000000) / 1000000000.0)
        * (1 + ln(1 + p.like_count + p.view_count * 0.1))
        * (case when p.published_at > now() - interval '7 days' then 1.5 else 1.0 end)
        * (case
             when p_session_id is not null and exists (
               select 1 from public.view_logs vl
               where vl.post_id = p.id
                 and vl.session_id = p_session_id
                 and vl.created_at > now() - interval '3 days'
             ) then 0.25
             else 1.0
           end)
      ) < p_cursor
    )
  order by score desc, p.id
  limit greatest(p_limit, 0);
$$;

grant execute on function
  public.get_feed_v2(text, text, int, double precision) to anon, authenticated;
