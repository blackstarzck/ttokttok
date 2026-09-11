-- ============================================================
-- 관리자 계정을 사용자 프로필과 분리한다
-- 설계: docs/superpowers/specs/2026-09-11-admin-accounts-design.md
-- ============================================================

-- ------------------------------------------------------------
-- 관리자 계정
-- ------------------------------------------------------------
-- 신원(id)은 auth.users에 그대로 남긴다 — auth.uid()가 살아 있어야 이 표를
-- 읽는 is_admin()이 RLS 안에서 동작한다.
--
-- 로그인 ID와 마지막 로그인 시각은 **일부러 넣지 않는다**. 둘 다 auth.users에
-- 이미 있고, 복제하면 원천이 둘이 되어 어긋났을 때 어느 쪽이 진실인지 알 수
-- 없다. 화면은 service role로 listUsers()를 한 번 불러 메모리에서 조인한다
-- (관리자 수는 한 자릿수다).
create table public.admin_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  level text not null default 'admin' check (level in ('owner', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- 만든 사람이 나중에 사라져도 나머지 행은 남아야 한다. 누가 만들었는지
  -- 모르게 되는 것이 그 행을 잃는 것보다 낫다.
  created_by uuid references public.admin_accounts (id) on delete set null
);

-- ------------------------------------------------------------
-- 판정 원천을 profiles.role에서 이 표로 옮긴다
-- ------------------------------------------------------------
-- **함수 본문만 바꾼다.** 이 함수를 쓰는 RLS 정책 28곳(8개 마이그레이션)은
-- 한 글자도 건드리지 않는다 — is_admin()이 이미 추상화 경계였다.
--
-- is_active = false가 곧 즉시 차단이다. 다음 요청부터 28개 정책이 전부
-- 거부한다. JWT 클레임 방식을 쓰지 않은 이유가 이것이다(토큰 만료 전까지
-- 비활성화가 안 먹는다).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_accounts
    where id = auth.uid() and is_active
  );
$$;

-- 관리자 계정 관리 전용. 정책보다 먼저 만들어야 한다.
create function public.is_admin_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_accounts
    where id = auth.uid() and is_active and level = 'owner'
  );
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
-- is_admin()/is_admin_owner()가 security definer라 이 표의 RLS를 우회한다.
-- 재귀가 생기지 않는다 — 기존 is_admin()과 같은 패턴이다.
alter table public.admin_accounts enable row level security;

-- 본인 행. 클라이언트가 "이 세션은 관리자다"를 판정하는 근거다.
create policy admin_accounts_select_self on public.admin_accounts
  for select to authenticated using (id = auth.uid());

-- 누가 접근 권한을 갖는지 관리자끼리는 볼 수 있다.
create policy admin_accounts_select_all on public.admin_accounts
  for select to authenticated using (public.is_admin());

-- 쓰기는 owner만. 그리고 **자기 행은 못 바꾼다** — 없으면 유일한 owner가
-- 자기를 내리거나 끄는 순간 아무도 관리자를 추가할 수 없는 잠긴 상태가 된다.
create policy admin_accounts_insert_owner on public.admin_accounts
  for insert to authenticated
  with check (public.is_admin_owner() and id <> auth.uid());

-- using과 with check를 **둘 다** 쓴다. using만 두면 "바꿀 수 있는 행"만
-- 정해지고 바꾼 뒤의 값은 검사되지 않아, 다른 owner의 행을 골라 그 행의 id를
-- 자기 것으로 바꾸는 우회가 열린다. 이 저장소는 같은 함정을 이미 겪었다
-- (20260902000001 · 20260903000001 주석 참조).
create policy admin_accounts_update_owner on public.admin_accounts
  for update to authenticated
  using (public.is_admin_owner() and id <> auth.uid())
  with check (public.is_admin_owner() and id <> auth.uid());

-- delete 정책은 두지 않는다. 계정은 지우지 않고 is_active로 끈다 —
-- 지우면 created_by 이력이 끊긴다.

-- ------------------------------------------------------------
-- 관리자에게는 프로필을 만들지 않는다
-- ------------------------------------------------------------
-- 관리자가 profiles 행을 가지면 서비스 사용자와 다시 섞인다. app_metadata의
-- 표식을 보고 건너뛴다.
--
-- **이것만 믿지 않는다**: GoTrue가 app_metadata를 INSERT에 함께 넣는지는
-- 문서로 보장된 바가 없다. 계정 생성 경로(create-admin.mjs, /admin/accounts)가
-- 직후에 profiles 행을 한 번 더 지워 이중으로 막는다.
--
-- 2026-09-11 로컬 실측: auth.users에 직접 INSERT하면 아래 분기가 정상 동작해
-- 프로필이 생기지 않는다. 그러나 GoTrue admin API(createUser)로 만들면 프로필이
-- **생긴다** — app_metadata를 INSERT 이후 단계에서 붙이기 때문이다. 즉 이
-- 분기는 소셜 로그인 경로의 안전망일 뿐이고, 관리자 생성 경로에서 프로필이
-- 남지 않게 하는 실질적 방어는 생성 직후의 delete다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'ttokttok_admin', '') = 'true' then
    return new;
  end if;

  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      '독자-' || left(new.id::text, 8)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;
