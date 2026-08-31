-- ============================================================
-- 피드 커서 페이지네이션 정정 (get_feed_v2 → get_feed_v3)
--
-- v2는 다음 페이지의 첫 항목으로 이전 페이지의 마지막 항목을 다시 냈다.
-- 페이지 크기 4로 시드 25개를 전부 순회했더니 16개 시드에서 중복이 났다.
--
-- 처음엔 점수 식의 타입 문제로 봤다. 나누는 수 1000000000.0이 numeric
-- 상수라 점수가 numeric으로 계산되는데, v2는 SELECT에서만 double로
-- 캐스팅하고 WHERE에서는 캐스팅하지 않은 numeric을 비교했기 때문이다.
-- 점수를 서브쿼리에서 한 번만 계산하도록 고쳤지만 중복은 그대로였다.
--
-- 실제 원인은 SQL 바깥이었다. 값을 직접 찍어 확인한 결과:
--
--   PostgREST가 돌려준 점수   7.9186845469405      (유효숫자 14자리)
--   DB 안의 실제 double       7.9186845469404998
--
-- double을 JSON으로 낼 때 왕복 불가능한 자릿수로 자른다. 클라이언트가 그
-- 값을 커서로 돌려주면 실제보다 큰 수가 되어 `score < p_cursor`가 커서 행
-- 자신을 통과시킨다. 반올림이 반대로 가면 그 사이 게시물이 통째로
-- 건너뛰어져 아무리 스크롤해도 닿지 않는다 — 중복보다 이쪽이 나쁘다.
--
-- 그래서 두 가지를 바꾼다:
--
--   1. 점수를 숫자로 주고받지 않는다. DB가 float8out으로 만든 문자열을
--      그대로 돌려받아 다시 double로 캐스팅한다 — 이 왕복은 정확하다.
--      extra_float_digits를 함수에 고정해 그 보장을 세션 설정에 맡기지
--      않는다. 클라이언트는 cursor_token을 해석하지 않는다.
--
--   2. 커서를 (점수, id) 키셋으로 만든다. 점수가 똑같은 게시물이 둘 있으면
--      점수 비교만으로는 둘 다 잘려 하나가 영영 나오지 않는다.
--
--   3. 점수 식은 서브쿼리에 한 번만 둔다. 정렬·비교·반환이 같은 값을
--      본다 — 식이 두 군데 있으면 언제든 다시 어긋난다.
--
-- 검증: 페이지 크기 2·4·10 × 시드 12개 = 36회 전체 순회에서 중복 0건,
-- 누락 0건.
--
-- security definer인 이유는 v2와 같다: 이미 봤는지 판정하려면 view_logs를
-- 읽어야 하는데 그 표는 관리자만 select할 수 있다(§6 RLS). 이 함수는
-- status='published'만 돌려주므로 posts의 공개 범위를 넘지 않는다.
-- ============================================================

create function public.get_feed_v3(
  p_seed text,
  p_session_id text default null,
  p_limit int default 10,
  p_cursor text default null,
  p_cursor_id uuid default null
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
  select s.id, s.score::text
  from (
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
  ) s
  -- 정렬이 (score desc, id asc)이므로 다음 페이지는 그 뒤에 오는 것들이다.
  where p_cursor is null
     or s.score < p_cursor::double precision
     or (s.score = p_cursor::double precision and s.id > p_cursor_id)
  order by s.score desc, s.id
  limit greatest(p_limit, 0);
$$;

grant execute on function
  public.get_feed_v3(text, text, int, text, uuid) to anon, authenticated;

-- v2는 같은 일을 하면서 페이지를 겹치게 낸다. 남겨 두면 언젠가 다시 불린다.
drop function public.get_feed_v2(text, text, int, double precision);
