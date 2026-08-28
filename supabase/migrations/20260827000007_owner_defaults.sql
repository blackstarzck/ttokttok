-- ============================================================
-- 소유자 컬럼 기본값 = auth.uid()
--
-- likes/comments/bookmarks/reading_progress/reports는 전부 "본인 행만"
-- RLS가 걸려 있다. 클라이언트가 user_id를 매번 실어 보내게 하면
--   ① 빠뜨리면 NOT NULL 위반으로 실패하고
--   ② 남의 id를 넣어보려는 시도가 RLS까지 가서야 걸린다.
-- 기본값을 세션 사용자로 두면 클라이언트는 아예 이 값을 다루지 않는다.
-- ============================================================

alter table public.likes
  alter column user_id set default auth.uid();

alter table public.comments
  alter column user_id set default auth.uid();

alter table public.bookmarks
  alter column user_id set default auth.uid();

alter table public.reading_progress
  alter column user_id set default auth.uid();

alter table public.reports
  alter column reporter_id set default auth.uid();
