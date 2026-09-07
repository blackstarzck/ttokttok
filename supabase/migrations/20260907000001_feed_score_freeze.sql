-- ============================================================
-- 정렬 RPC의 점수를 페이지네이션 동안 고정한다
--
-- 문제: get_feed_v4의 점수가 now()와 살아 있는 카운터에 의존해서, 사용자가
-- 1페이지를 **보는 동안** 점수가 바뀐다. 커서는 (점수, id) 키셋이고
-- 다음 페이지 조건이 `score < cursor`이므로, 1페이지에서 이미 준 게시물의
-- 점수가 내려가면 그 게시물이 정확히 2페이지 창으로 굴러떨어진다.
--
-- 가장 크게 움직이는 것이 seen_penalty다. 1페이지를 보면 record_view가
-- view_logs에 행을 남기고, 2페이지 조회 시점에는 그 10개의 점수가 전부
-- 0.25배가 된다 — 커서보다 확실히 아래다. **1페이지 게시물이 2페이지에
-- 통째로 다시 나온다.** 첫 방문자에게 특히 잘 보인다(볼 때까지 view_logs가
-- 비어 있어서 1페이지 점수에 벌점이 하나도 안 들어가 있기 때문).
--
-- 해법: 점수의 시간 기준점(as_of)을 페이지네이션 시작 시각에 못 박고,
-- 그 시각 이후에 생긴 것은 점수에 반영하지 않는다.
--
-- as_of를 어디에 둘 것인가 — **커서 토큰 안에 넣는다.** 새 인자를 만들면
-- 오버로드가 되어 PGRST203을 부르고(20260904000001 주석), 새 쿠키를 심으면
-- seed·session-id에 이어 세 번째 피드 쿠키가 되며 seed와 어긋날 여지가
-- 생긴다. 반면 커서 토큰은 이미 "DB가 만들고 클라이언트는 해석하지 않는
-- 불투명 값"으로 규약이 서 있고(feed.ts의 FeedCursor 주석), 한 번의
-- 페이지네이션과 수명이 정확히 같다. 그래서 형식만 `<점수>|<as_of>`로
-- 늘린다. 인자 목록이 그대로라 create or replace로 갈아끼우면 되고,
-- 이 저장소가 v3→v4에서 했던 이름 바꾸기·drop이 필요 없다.
--
-- 1페이지(p_cursor null)는 as_of = now()다. 옛 형식 토큰(`|` 없음)도
-- as_of가 빈 문자열로 읽혀 now()로 떨어지므로 배포 순간에 손에 쥐고 있던
-- 커서가 깨지지 않는다.
--
-- view_count도 같이 되돌린다. record_view가 view_logs 1행과 view_count +1을
-- 같은 트랜잭션에서 움직이므로, as_of 이후의 view_logs 행 수를 빼면 그
-- 시점의 view_count가 **정확히** 복원된다(view_logs는 append-only다 — 지우는
-- 코드가 저장소에 없다). 이게 필요한 이유는 `view_count < 50` 면제가
-- 연속이 아니라 절벽이기 때문이다: 사용자가 1페이지를 보다가 49→50을
-- 넘긴 게시물은 배수가 median에서 자기 popularity로 뚝 떨어지고, 그건
-- 다시 seen_penalty와 똑같은 방향(점수 하락 → 2페이지 창)이다.
--
-- 토큰의 as_of는 공백 없는 ISO 8601 UTC로 쓴다(아래 to_char). datestyle도
-- 함수에 고정한다 — 되읽을 때의 `::timestamptz` 파싱이 부르는 쪽 세션
-- 설정에 흔들리지 않게 하려는 것이다.
--
-- 남는 한계(고치지 않았고, 고칠 수 없다):
--   * like_count는 되돌리지 못한다 — 좋아요 취소가 post_likes 행을 지워서
--     "as_of 시점의 like_count"를 복원할 이력이 남지 않는다. 다만 크기가
--     다르다: seen_penalty는 4배 절벽이지만 좋아요 한 개는 ln()/4 안에서
--     움직이는 연속 변화고, 피드에서 누르는 쪽(좋아요 추가)은 점수를
--     **올려** 커서 위에 머무르게 하므로 중복을 만들지 않는다.
--   * 다른 사용자의 조회·좋아요로 인한 표류는 그대로 남는다. 어떤 키셋
--     페이지네이션에도 있는 동시 쓰기 문제이고, 위와 달리 이 사용자의
--     1페이지 게시물에 체계적으로 몰리지 않는다.
-- ============================================================

create or replace function public.get_feed_v4(
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
set datestyle = 'ISO, MDY'
stable
as $$
  with params as (
    select
      -- 옛 형식 토큰과 1페이지는 둘 다 여기서 now()로 떨어진다.
      coalesce(nullif(split_part(p_cursor, '|', 2), '')::timestamptz, now()) as as_of,
      nullif(split_part(p_cursor, '|', 1), '')::double precision as cursor_score
  ),
  base as (
    select
      p.id,
      p.published_at,
      p.like_count,
      -- as_of 이후에 쌓인 조회를 되돌린다. greatest는 방어용이다 —
      -- 정상 경로에서는 음수가 되지 않지만, 조작된 토큰이 먼 과거를
      -- 가리키면 view_count보다 많은 행이 걸릴 수 있다.
      greatest(
        p.view_count - (
          select count(*)
          from public.view_logs vl
          where vl.post_id = p.id
            and vl.created_at > pa.as_of
        ),
        0
      ) as view_count
    from public.posts p
    cross join params pa
    where p.status = 'published'
      and (p_type is null or p.type = p_type)
  ),
  weights as (
    select
      b.id,
      b.published_at,
      b.view_count,
      -- [1, 3]으로 압축된 인기 가중 (조회는 좋아요보다 가볍게)
      1 + least(ln(1 + b.like_count + b.view_count * 0.1) / 4, 2) as popularity
    from base b
  ),
  baseline as (
    select percentile_cont(0.5) within group (order by popularity) as median
    from weights
  )
  -- as_of를 timestamptz의 기본 텍스트('2026-09-07 08:04:25.288544+00')로
  -- 넣지 않는다 — 거기 들어 있는 **공백**이 문제다. 이 토큰은 PostgREST
  -- JSON → 서버 컴포넌트 prop → 서버 액션 인자로 여러 계층을 건너다니는
  -- 배선 형식이고, 그 경로 어디든 공백에서 잘리는 곳이 하나만 있어도
  -- 커서가 조용히 깨진다(그러면 as_of가 사라져 now()로 떨어지고, 이
  -- 마이그레이션이 고친 버그가 그대로 돌아온다 — 에러 없이).
  -- ISO 8601 UTC로 직렬화하면 공백도 로캘 의존도 없다.
  select s.id, s.score::text || '|'
         || to_char(s.as_of at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  from (
    select
      w.id,
      pa.as_of,
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
        * (case when w.published_at > pa.as_of - interval '7 days' then 1.5 else 1.0 end)
        -- 이미 본 글은 뒤로. 아예 빼지는 않는다 — 콘텐츠가 적을 때
        -- 피드가 비어 버리기 때문. 상한(<= as_of)이 이 마이그레이션의
        -- 핵심이다: 이게 없으면 1페이지를 보는 행위가 2페이지의 점수를
        -- 바꾼다.
        * (case
             when p_session_id is not null and exists (
               select 1 from public.view_logs vl
               where vl.post_id = w.id
                 and vl.session_id = p_session_id
                 and vl.created_at > pa.as_of - interval '3 days'
                 and vl.created_at <= pa.as_of
             ) then 0.25
             else 1.0
           end)
      )::double precision as score
    from weights w
    cross join params pa
  ) s
  cross join params pa2
  -- 정렬이 (score desc, id asc)이므로 다음 페이지는 그 뒤에 오는 것들이다.
  where p_cursor is null
     or s.score < pa2.cursor_score
     or (s.score = pa2.cursor_score and s.id > p_cursor_id)
  order by s.score desc, s.id
  limit greatest(p_limit, 0);
$$;

grant execute on function
  public.get_feed_v4(text, text, int, text, uuid, text) to anon, authenticated;
