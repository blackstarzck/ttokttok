-- ============================================================
-- profiles.role 제거 — 관리자 판정은 admin_accounts가 한다 (20260911000002)
-- ============================================================

-- profiles_update_own의 with check가 role을 참조한다. 정책을 먼저
-- 떨어뜨리지 않으면 drop column이 의존성 오류로 실패한다.
drop policy "profiles_update_own" on public.profiles;

-- 관리자였던 계정의 닉네임을 중립적인 값으로 바꾼다. 일반 사용자가 된 뒤에도
-- "관리자"로 댓글에 표시되면 사칭이 된다. 폴백 형태는 handle_new_user가
-- 이미 쓰는 것과 같고, 본인이 앱에서 언제든 바꿀 수 있다.
update public.profiles
   set nickname = '독자-' || left(id::text, 8)
 where role = 'admin';

alter table public.profiles drop column role;

-- 셀프 승격 방지 조항(`and role = 'user'`)은 필요 없어졌다 — 승격할 컬럼이
-- 없다. 관리자 승격은 admin_accounts에 owner만 쓸 수 있다.
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);
