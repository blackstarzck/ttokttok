-- ============================================================
-- 피드 정렬: "아예 안 나오는 게시물"을 없앤다
--
-- 방금 발행한 게시물이 홈에서 보이지 않는다는 보고. 측정해 보니 버그가
-- 아니라 공식이 설계대로 동작한 결과였다.
--
--   점수 = 난수[0,1) × 인기가중 × 신선도
--   인기가중 = 1 + ln(1 + 좋아요 + 조회 × 0.1)      -- 상한 없음
--
-- 시드 데이터 기준 인기가중이 1.00 ~ 9.57까지 벌어진다. 조회 0인 새
-- 게시물은 가중이 정확히 1이라, 신선도 1.5배를 받아도 낼 수 있는 최대
-- 점수가 1.5다 — 인기 게시물의 기대점수(7.18)보다도 낮다. 난수는 [0,1)
-- 범위라 이 격차를 절대 뒤집지 못한다.
--
-- 시드 200개로 잰 순위 분포 (전체 11개 중):
--   9위 11% / 10위 40% / 11위 45%  → 96%가 하위 3위, 45%는 첫 페이지 밖
--
-- 안 보이니 조회가 안 쌓이고, 조회가 없으니 계속 안 보이는 고리다.
-- 신선도 1.5배는 원래 이걸 막으려던 장치인데, 1→9.6으로 벌어지는 가중에
-- 곱해지는 구조라 실효가 없었다.
--
-- 두 가지를 바꾼다:
--
--   1. 인기가중을 [1, 3]으로 압축한다. ln을 4로 나누고 2에서 자른다.
--      상한이 없으면 조회 격차가 난수를 완전히 압도해, 낮은 쪽은 확률이
--      0에 수렴한다 — 그게 "아예 안 나오는" 상태의 정체다.
--
--   2. **아직 충분히 노출되지 않은** 게시물은 인기 페널티를 면제하고
--      현재 피드 인기가중의 **중앙값**을 준다. 아직 평가할 근거가 없는
--      글에 근거가 없다는 이유로 벌을 주지 않는다. 최고값이 아니라
--      중앙값인 이유는, 새 글이 피드를 독점하지 않고 "평범한 글만큼의
--      기회"만 갖게 하기 위해서다.
--
--      기준을 발행 시각이 아니라 **조회수**로 잡는다. "발행 24시간 이내"로
--      했더니 24시간 안에 노출을 못 받은 글은 조회가 0인 채로 면제만
--      풀려 같은 고리에 다시 갇혔다 — 측정값으로 첫 페이지 밖 42%.
--      조회수 기준이면 실제로 보여질 때까지 기회가 유지되고, 보여진
--      뒤에는 진짜 신호로 평가받는다. 스스로 풀리는 조건이다.
--
--      임계값 50: 이 정도 노출되면 좋아요·이탈로 판단할 근거가 생긴다는
--      뜻이다. 콘텐츠가 늘면 다시 재는 게 좋다.
--
-- 커서·정렬 인터페이스는 그대로다(20260828000001) — 시그니처가 같아
-- create or replace로 갈아 끼운다.
-- ============================================================

create or replace function public.get_feed_v3(
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
  with weights as (
    select
      p.id,
      p.published_at,
      p.view_count,
      -- [1, 3]으로 압축된 인기 가중 (조회는 좋아요보다 가볍게)
      1 + least(ln(1 + p.like_count + p.view_count * 0.1) / 4, 2) as popularity
    from public.posts p
    where p.status = 'published'
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
