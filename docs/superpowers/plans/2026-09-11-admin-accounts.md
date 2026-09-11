# 관리자 계정 분리 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 신원을 `profiles.role`에서 별도 `admin_accounts` 표로 옮기고, 로그인 ID를 이메일이 아닌 `ttokttok.admin` 형태로 바꿔 관리자 계정에 소셜 identity가 자동으로 붙던 경로를 없앤다.

**Architecture:** 신원은 `auth.users`에 남긴다 — 그래야 `auth.uid()`가 살아 있고 `is_admin()`을 부르는 24줄이 그대로 동작한다(실측 정정 — 설계 당시 "28곳"으로 적었으나 선언·주석을 포함한 수였다). `is_admin()` **함수 본문만** 교체해 판정 원천을 갈아 끼우고, 정책은 한 곳도 건드리지 않는다. 로그인 ID는 라우팅되지 않는 도메인(`@ttokttok.local`)을 붙인 합성 이메일로 `auth.users`에 담는다.

**Tech Stack:** Next.js 16 (App Router) · Supabase (Postgres + Auth + RLS) · TypeScript · vitest(순수 함수) · node:test(로컬 DB 인테그레이션) · Playwright(E2E)

**설계 문서:** [docs/superpowers/specs/2026-09-11-admin-accounts-design.md](../specs/2026-09-11-admin-accounts-design.md)

## Global Constraints

- 스타일은 시맨틱 토큰만 (`bg-background`, `text-muted-foreground`). 원시 hex·px·Tailwind 팔레트 직접 참조 금지.
- 서버 상태는 조회 실패를 삼키지 않는다 — 어드민은 `throw`, 사용자 화면은 `failed` 플래그 (결정 기록 §11-61).
- 모든 어드민 서버 액션은 `requireAdmin()` 또는 `requireOwner()`로 시작한다. 최종 방어선은 RLS다.
- DB 변경은 `supabase/migrations/` 파일로만 한다. 기존 마이그레이션 파일은 절대 수정하지 않는다.
- `packages/shared`는 React·Next·DOM·네트워크에 의존하지 않는다.
- 규칙·스키마를 바꾸면 해당 문서를 **같은 커밋에서** 갱신한다.
- 관리자 로그인 ID: `ttokttok.admin` · 비밀번호: `admin123` (설계 §10 — 프로덕션 포함, 정식 오픈 전 교체 필요).
- 합성 이메일 도메인: `ttokttok.local` (변경 금지 — 라우팅되지 않는다는 성질이 설계의 근거다).
- 관리자 등급: `owner` | `admin` 2단계.
- 화면 작업은 375px 뷰포트에서 실제 렌더 확인.

## 작업 순서와 의존

```
Task 1 (admin-id.ts, 순수 함수)
   └→ Task 2 (전환: 마이그레이션 + 가드 + 부트스트랩 + 로그인 폼)   ← 여기서 판정 원천이 바뀐다
         └→ Task 3 (profiles.role 제거 + 소비처 정리)
               ├→ Task 4 (클라이언트 관리자 세션 거부)
               └→ Task 5 (/admin/accounts owner 전용 화면)
                     └→ Task 6 (E2E · 문서 · 최종 검증)
```

Task 2는 쪼갤 수 없다 — 판정 원천을 바꾸는 마이그레이션, 그 원천을 읽는 가드, 첫 행을 넣는 부트스트랩이 함께 들어가야 시스템이 동작한다. 중간 상태는 "가드는 통과시키는데 RLS가 모든 쓰기를 막는" 고장이다.

---

## Task 1: 관리자 ID ↔ 합성 이메일 맵핑

**Files:**
- Create: `packages/shared/src/admin-id.ts`
- Test: `packages/shared/src/admin-id.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수, 의존 없음)
- Produces:
  - `ADMIN_EMAIL_DOMAIN: "ttokttok.local"`
  - `isValidAdminId(id: unknown): id is string`
  - `adminIdToEmail(id: string): string` — 형식이 아니면 throw
  - `emailToAdminId(email: unknown): string | null` — 관리자 합성 이메일이 아니면 null

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/src/admin-id.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL_DOMAIN,
  adminIdToEmail,
  emailToAdminId,
  isValidAdminId,
} from "./admin-id";

describe("관리자 ID 형식", () => {
  it.each(["ttokttok.admin", "admin", "a-b_c.d", "abc123"])(
    "받아들인다: %s",
    (id) => {
      expect(isValidAdminId(id)).toBe(true);
    },
  );

  // 대문자를 막는 이유: 같은 사람이 Admin/admin 두 계정을 갖게 된다.
  // @를 막는 이유: 이어 붙이면 a@b.com@ttokttok.local 이 된다.
  it.each([
    "Admin",
    "ab",
    "-abc",
    ".abc",
    "a b",
    "a@b.com",
    "한글아이디",
    "a".repeat(33),
    "",
    null,
    123,
  ])("거부한다: %s", (id) => {
    expect(isValidAdminId(id)).toBe(false);
  });
});

describe("합성 이메일 맵핑", () => {
  it("ID에 라우팅되지 않는 도메인을 붙인다", () => {
    expect(adminIdToEmail("ttokttok.admin")).toBe(
      `ttokttok.admin@${ADMIN_EMAIL_DOMAIN}`,
    );
  });

  it("형식이 아닌 ID는 던진다 — 조용히 이상한 주소를 만들지 않는다", () => {
    expect(() => adminIdToEmail("a@b.com")).toThrow();
  });

  it("왕복한다", () => {
    expect(emailToAdminId(adminIdToEmail("ttokttok.admin"))).toBe(
      "ttokttok.admin",
    );
  });

  // 이 함수가 "이 세션은 관리자인가"를 판정하는 데 쓰이면 안 된다는 뜻이기도 하다 —
  // 진짜 사용자의 이메일은 전부 null이 되어야 한다.
  it.each([
    "reader@gmail.com",
    "bucheongosok@gmail.com",
    "admin@ttokttok.test",
    "A@b.com",
    null,
    undefined,
  ])("관리자 합성 이메일이 아니면 null: %s", (email) => {
    expect(emailToAdminId(email)).toBeNull();
  });

  it("도메인은 맞지만 ID 형식이 아니면 null", () => {
    expect(emailToAdminId(`Admin@${ADMIN_EMAIL_DOMAIN}`)).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx vitest run packages/shared/src/admin-id.test.ts
```

Expected: FAIL — `Failed to resolve import "./admin-id"`

- [ ] **Step 3: 구현한다**

`packages/shared/src/admin-id.ts`:

```ts
/**
 * 관리자 로그인 ID ↔ 내부 저장용 합성 이메일.
 *
 * Supabase Auth의 signInWithPassword는 이메일이나 전화번호만 받는데, 관리자
 * 로그인 ID는 이메일 형식이 아니다. 그래서 라우팅되지 않는 도메인을 붙여
 * auth.users에 담는다 — 관리자는 이 주소를 볼 일이 없다.
 *
 * **도메인이 실재하지 않는 것이 이 설계의 핵심이다.** 관리자 계정에 구글
 * identity가 저절로 붙어 운영 계정이 서비스 사용자로 활동한 일이 있었다
 * (2026-09-01, 설계 문서 §1). Supabase가 이메일이 일치하는 기존 계정에 소셜
 * identity를 자동으로 연결하기 때문인데, @ttokttok.local 계정은 구글·카카오에
 * 존재할 수 없으므로 그 연결의 전제 자체가 사라진다.
 */
export const ADMIN_EMAIL_DOMAIN = "ttokttok.local";

// 소문자·숫자로 시작하는 3~32자. 대문자를 막는 이유는 같은 사람이 Admin과
// admin 두 계정을 갖는 것을 막기 위해서고, @를 막는 이유는 이어 붙였을 때
// a@b.com@ttokttok.local 같은 주소가 만들어지는 것을 막기 위해서다.
const ADMIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function isValidAdminId(id: unknown): id is string {
  return typeof id === "string" && ADMIN_ID_PATTERN.test(id);
}

export function adminIdToEmail(id: string): string {
  if (!isValidAdminId(id)) {
    throw new Error(`관리자 ID 형식이 아닙니다: ${String(id)}`);
  }
  return `${id}@${ADMIN_EMAIL_DOMAIN}`;
}

export function emailToAdminId(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const suffix = `@${ADMIN_EMAIL_DOMAIN}`;
  if (!email.endsWith(suffix)) return null;
  const id = email.slice(0, -suffix.length);
  return isValidAdminId(id) ? id : null;
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npx vitest run packages/shared/src/admin-id.test.ts
```

Expected: PASS — 모든 테스트 통과

- [ ] **Step 5: 커밋한다**

```bash
git add packages/shared/src/admin-id.ts packages/shared/src/admin-id.test.ts
git commit -m "feat(shared): map admin login IDs to non-routable synthetic emails"
```

---

## Task 2: 판정 원천 전환 — 마이그레이션 · 가드 · 부트스트랩 · 로그인 폼

이 작업이 끝나면 관리자 판정이 `admin_accounts`로 완전히 넘어가고, `ttokttok.admin` / `admin123`으로 로그인된다. `profiles.role` 컬럼은 아직 남아 있다 (Task 3에서 제거).

**Files:**
- Create: `supabase/migrations/20260911000002_admin_accounts.sql`
- Modify: `apps/admin/src/lib/admin-guard.ts` (전체 교체)
- Modify: `apps/admin/src/app/admin/login/page.tsx:17-28` (signIn 액션), `:63-75` (이메일 필드)
- Modify: `scripts/create-admin.mjs` (전체 교체)
- Modify: `scripts/test-db.mjs` — `TEST_ADMIN_EMAIL: "admin@ttokttok.test"` → `TEST_ADMIN_ID: "test.admin"`
- Modify: `tests/live-db/fixtures.ts:79-107`
- Modify: `docs/prd-ttokttok.md` §6 데이터 모델

**Interfaces:**
- Consumes: `adminIdToEmail`, `ADMIN_EMAIL_DOMAIN` (Task 1)
- Produces:
  - SQL: `public.admin_accounts` 표, `public.is_admin()` (교체), `public.is_admin_owner()`
  - `readAdminAccess(): Promise<{ userId: string; isAdmin: boolean; level: "owner" | "admin" | null } | null>`
  - `requireAdmin(): Promise<{ userId: string; level: "owner" | "admin" }>`
  - `requireOwner(): Promise<{ userId: string }>`

- [ ] **Step 1: 두 가지 가정을 로컬 DB에서 실측한다**

설계 §5가 "문서로 보장된 바가 없다"고 명시한 두 가정이다. 코드를 쓰기 전에 확인한다.

로컬 e2e DB를 띄운다:

```bash
npm run test:db
```

확인 스크립트를 저장소 루트에 임시로 만들어 돌린다 (node_modules 해석 때문에 루트여야 한다):

```bash
cat > ./.verify-gotrue.tmp.mjs <<'EOF'
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 가정 1: Supabase가 라우팅되지 않는 .local 도메인을 받는가
const email = `verify.probe@ttokttok.local`;
const { data, error } = await db.auth.admin.createUser({
  email, password: "admin123", email_confirm: true,
  app_metadata: { ttokttok_admin: true },
});
console.log("가정 1 — .local 이메일 수용:", error ? `✗ ${error.message}` : "✓");
if (error) process.exit(1);

// 가정 2: app_metadata가 INSERT에 함께 들어가 트리거가 볼 수 있는가
console.log("   저장된 app_metadata:", JSON.stringify(data.user.app_metadata));
const { data: prof } = await db.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
console.log("가정 2 — 트리거가 만든 프로필:", prof ? "있음 (트리거 단독으로는 못 막는다 → 이중 방어 필수)" : "없음");

await db.auth.admin.deleteUser(data.user.id);
console.log("정리 완료");
EOF
node --env-file=.env.test ./.verify-gotrue.tmp.mjs; rm -f ./.verify-gotrue.tmp.mjs
```

**가정 1이 실패하면 (`.local` 거부)** — 멈추고 보고한다. 도메인을 바꿔야 하며 설계 §4의 근거가 영향을 받는다.
**가정 2에서 프로필이 "있음"으로 나오면** — 정상이다. 이 시점에는 트리거에 아직 건너뛰기가 없다. Step 2에서 트리거를 고친 뒤 Step 4에서 다시 확인한다.

- [ ] **Step 2: 마이그레이션을 쓴다**

`supabase/migrations/20260911000002_admin_accounts.sql`:

```sql
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
-- **함수 본문만 바꾼다.** 이 함수를 부르는 기존 마이그레이션 5개의 24줄은
-- 한 글자도 건드리지 않는다 — is_admin()이 이미 추상화 경계였다.
--
-- is_active = false가 곧 즉시 차단이다. 다음 요청부터 그 24줄이 전부
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
```

**기존 관리자를 옮기는 구문은 없다.** `bucheongosok@gmail.com`은 일반 사용자로 남기기로 했다 (설계 §5). 따라서 이 마이그레이션 직후 관리자는 0명이고, Step 5의 부트스트랩이 첫 owner를 만든다.

- [ ] **Step 3: 마이그레이션을 로컬 DB에 적용한다**

```bash
node node_modules/supabase/dist/supabase.js --workdir .tmp/supabase-e2e db reset
```

Expected: 모든 마이그레이션이 순서대로 다시 적용되고 `20260911000002_admin_accounts.sql`에서 오류가 없다.

오류가 나면 대개 `is_admin_owner()`를 정책보다 뒤에 둔 순서 문제다.

- [ ] **Step 4: 트리거 건너뛰기를 실측한다**

Step 1의 스크립트를 다시 돌린다:

```bash
cat > ./.verify-gotrue.tmp.mjs <<'EOF'
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data, error } = await db.auth.admin.createUser({
  email: "verify.probe@ttokttok.local", password: "admin123", email_confirm: true,
  app_metadata: { ttokttok_admin: true },
});
if (error) { console.log("✗", error.message); process.exit(1); }
const { data: prof } = await db.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
console.log(prof ? "프로필 생김 — 트리거가 표식을 못 봤다. 이중 방어(생성 경로의 삭제)가 반드시 필요하다." : "✓ 프로필 없음 — 트리거가 건너뛰었다");
await db.auth.admin.deleteUser(data.user.id);
EOF
node --env-file=.env.test ./.verify-gotrue.tmp.mjs; rm -f ./.verify-gotrue.tmp.mjs
```

어느 결과든 **계속 진행한다** — 생성 경로의 프로필 삭제는 결과와 무관하게 남긴다. 결과를 Task 6의 결정 기록에 적을 수 있게 기록해 둔다.

- [ ] **Step 5: 부트스트랩 스크립트를 다시 쓴다**

`scripts/create-admin.mjs` 전체를 교체한다:

```js
/**
 * 첫 관리자(owner) 생성 / 비밀번호 갱신.
 *
 *   node --env-file=.env scripts/create-admin.mjs [비밀번호]
 *
 * ADMIN_ID(기본값 ttokttok.admin)를 로그인 ID로 쓴다. 관리자 로그인 ID는
 * 이메일 형식이 아니므로 라우팅되지 않는 도메인을 붙여 auth.users에 담는다
 * (packages/shared/src/admin-id.ts).
 *
 * **/admin/accounts 화면이 생겨도 이 스크립트는 남는다** — 첫 owner를 만들
 * 경로가 달리 없다. 화면은 owner로 로그인해야 열리고, 그러려면 owner가 이미
 * 있어야 한다.
 *
 * 공개 가입 경로는 열지 않는다. 결정 기록 §11-33 참조.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { adminIdToEmail } from "../packages/shared/src/admin-id.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminId = process.env.ADMIN_ID ?? "ttokttok.admin";

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요하다.",
  );
  process.exit(1);
}

const email = adminIdToEmail(adminId);

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 비밀번호는 저장소에 남기지 않는다 — 인자로 받거나 즉석에서 만들어 한 번만 출력한다.
const password = process.argv[2] ?? randomBytes(12).toString("base64url");
const generated = !process.argv[2];

async function run() {
  const { data: list, error: listErr } = await db.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);

  const existing = list.users.find((u) => u.email === email);
  let userId;

  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { ttokttok_admin: true },
    });
    if (error) throw new Error(`비밀번호 갱신: ${error.message}`);
    userId = existing.id;
    console.log(`✓ 기존 계정 비밀번호 갱신: ${adminId}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 메일 발송 없이 바로 사용 가능하게
      app_metadata: { ttokttok_admin: true },
    });
    if (error) throw new Error(`계정 생성: ${error.message}`);
    userId = data.user.id;
    console.log(`✓ 계정 생성: ${adminId}`);
  }

  // 트리거가 app_metadata 표식을 보고 건너뛰지만, GoTrue가 그 값을 INSERT에
  // 함께 넣는다는 보장이 문서에 없다. 실제로 만들어졌다면 여기서 지운다.
  const { error: profErr } = await db
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profErr) throw new Error(`프로필 정리: ${profErr.message}`);

  const { error: acctErr } = await db
    .from("admin_accounts")
    .upsert({ id: userId, name: "관리자", level: "owner", is_active: true });
  if (acctErr) throw new Error(`관리자 등록: ${acctErr.message}`);
  console.log("✓ admin_accounts 등록 (level = owner)");

  if (generated) {
    console.log(`\n비밀번호(이번에만 표시): ${password}`);
    console.log("안전한 곳에 보관할 것. 저장소에는 남지 않는다.");
  }
  console.log(`\n로그인 ID: ${adminId}`);
  console.log(`로그인: ${process.env.NEXT_PUBLIC_SITE_URL}/admin/login`);
}

run().catch((err) => {
  console.error("\n✗ 실패:", err.message);
  process.exit(1);
});
```

> `.ts` 파일을 `.mjs`에서 직접 import하므로 Node 24의 타입 스트리핑이 필요하다. 실행에 실패하면 `node --experimental-strip-types`를 붙인다.

- [ ] **Step 6: 로컬 DB에 첫 owner를 만든다**

```bash
node --env-file=.env.test scripts/create-admin.mjs admin123
```

Expected:
```
✓ 계정 생성: ttokttok.admin
✓ admin_accounts 등록 (level = owner)

로그인 ID: ttokttok.admin
```

- [ ] **Step 7: 가드를 교체한다**

`apps/admin/src/lib/admin-guard.ts` 전체:

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminLevel = "owner" | "admin";

export type AdminAccess = {
  userId: string;
  isAdmin: boolean;
  level: AdminLevel | null;
};

/**
 * 어드민 화면·서버 액션의 공통 관문.
 *
 * 미들웨어는 "로그인했는가"만 본다. 여기서 관리자인지까지 확인한다.
 * 서버 액션은 미들웨어를 거치지 않을 수 있으므로, 쓰기 액션마다 이 함수를
 * 먼저 부른다 — 그리고 최종 방어선은 RLS다.
 */
export async function requireAdmin(): Promise<{
  userId: string;
  level: AdminLevel;
}> {
  const access = await readAdminAccess();

  if (!access) redirect("/admin/login");
  if (!access.isAdmin || !access.level) redirect("/admin/login?error=forbidden");

  return { userId: access.userId, level: access.level };
}

/** 관리자 계정 관리 전용 관문. RLS도 owner만 쓰기를 허용한다. */
export async function requireOwner(): Promise<{ userId: string }> {
  const { userId, level } = await requireAdmin();
  if (level !== "owner") redirect("/admin?error=owner_only");
  return { userId };
}

/**
 * 같은 판정을 리다이렉트 없이 돌려준다.
 *
 * 로그인 페이지가 필요로 한다 — 거기서는 "관리자면 /admin으로 보낸다"라
 * 목적지가 반대라서 requireAdmin의 리다이렉트를 재사용할 수 없다. 그리고
 * 이 판정을 관리자 여부를 모르는 미들웨어에 맡기면 두 관문이 서로를 가리켜
 * 무한 리다이렉트가 된다(supabase/middleware.ts 주석).
 *
 * 로그인하지 않았으면 null. 로그인은 했지만 관리자가 아니면 isAdmin=false.
 */
export async function readAdminAccess(): Promise<AdminAccess | null> {
  const db = await createClient();

  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return null;

  const { data: account, error } = await db
    .from("admin_accounts")
    .select("level, is_active")
    .eq("id", user.id)
    .maybeSingle();

  // 조회 실패를 삼키면 account가 null이 되어 호출부가 "권한 없음"으로
  // 흘러간다 — 진짜 관리자가 일시적 오류에 forbidden 화면을 보고 자기
  // 계정이 강등된 줄 안다. 던져도 **닫히는 쪽은 그대로다**: 접근이
  // 허용되지 않는다는 결과는 같고, 이유만 정직해진다. (결정 기록 §11-61)
  if (error) throw new Error(error.message);

  // is_active=false는 "계정은 있지만 꺼져 있다"다. RLS의 is_admin()도 같은
  // 조건을 보므로 화면과 DB의 판정이 어긋나지 않는다.
  const isAdmin = Boolean(account?.is_active);

  return {
    userId: user.id,
    isAdmin,
    level: isAdmin ? (account!.level as AdminLevel) : null,
  };
}
```

- [ ] **Step 8: 로그인 폼을 ID 방식으로 바꾼다**

`apps/admin/src/app/admin/login/page.tsx` — import에 추가:

```ts
import { adminIdToEmail, isValidAdminId } from "@ttokttok/shared/admin-id";
```

`signIn` 액션을 교체한다:

```ts
async function signIn(formData: FormData) {
  "use server";

  const adminId = String(formData.get("adminId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeAdminPath(formData.get("next"));

  // 형식이 아니면 adminIdToEmail이 던진다. 던지면 Next 에러 화면이 뜨는데,
  // 오타 하나에 그건 과하다 — 자격증명 오류와 같은 문구로 되돌린다.
  if (!isValidAdminId(adminId)) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const db = await createClient();
  const { error } = await db.auth.signInWithPassword({
    email: adminIdToEmail(adminId),
    password,
  });

  if (error) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}
```

이메일 입력 필드를 교체한다:

```tsx
        <div className="flex flex-col gap-2">
          <Label htmlFor="adminId">아이디</Label>
          <Input
            id="adminId"
            name="adminId"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
```

오류 문구도 ID 기준으로 바꾼다 (기존 `error === "forbidden"` 분기는 그대로):

```tsx
            {error === "forbidden"
              ? "이 계정에는 관리자 권한이 없습니다. 관리자 계정으로 로그인하세요."
              : "아이디 또는 비밀번호가 맞지 않습니다."}
```

- [ ] **Step 9: 테스트 픽스처와 테스트 DB 환경을 맞춘다**

`scripts/test-db.mjs`에서 한 줄을 바꾼다:

```js
    TEST_ADMIN_EMAIL: "admin@ttokttok.test",
```
→
```js
    TEST_ADMIN_ID: "test.admin",
```

`tests/live-db/fixtures.ts`의 계정 생성 블록(79~107행)을 교체한다:

```ts
  const existing = check(await db.auth.admin.listUsers()).data.users;
  for (const role of ["admin", "user"] as const) {
    // 관리자는 라우팅되지 않는 합성 이메일을 쓴다 — 사용자와 신원 공간이
    // 겹치지 않는다는 것이 이 설계의 요점이다.
    const email =
      role === "admin"
        ? adminIdToEmail(process.env.TEST_ADMIN_ID!)
        : process.env.TEST_USER_EMAIL!;
    const found = existing.find((user) => user.email === email);
    const user =
      found ??
      check(
        await db.auth.admin.createUser({
          email,
          password: process.env.TEST_PASSWORD!,
          email_confirm: true,
          app_metadata: role === "admin" ? { ttokttok_admin: true } : {},
          user_metadata: {
            name: role === "admin" ? "테스트 관리자" : "테스트 독자",
          },
        }),
      ).data.user;
    if (!user) throw new Error("Fixture user missing");

    if (role === "admin") {
      // 트리거가 건너뛰지만 이중으로 막는다 (마이그레이션 주석 참조).
      check(await db.from("profiles").delete().eq("id", user.id));
      check(
        await db.from("admin_accounts").upsert({
          id: user.id,
          name: "테스트 관리자",
          level: "owner",
          is_active: true,
        }),
      );
    } else {
      check(
        await db
          .from("profiles")
          .update({ nickname: "테스트 독자" })
          .eq("id", user.id),
      );
      // Only this test account's interactions are reset; never reset the database.
      for (const table of ["likes", "bookmarks", "reading_progress", "comments"])
        check(await db.from(table).delete().eq("user_id", user.id));
    }
  }
```

파일 상단 import에 추가한다:

```ts
import { adminIdToEmail } from "@ttokttok/shared/admin-id";
```

> 관리자에게는 `likes`/`bookmarks`/`reading_progress`/`comments` 정리를 돌리지 않는다 — 그 표들은 `profiles`를 참조하는데 관리자에게는 프로필 행이 없다.

- [ ] **Step 10: 인테그레이션 테스트로 전환을 확인한다**

`npm run test:integration`을 돌리기 전에, `tests/live-db/admin.test.ts:24-26`의 셀프 승격 검사가 아직 `profiles.role`을 쓴다. 그 부분만 잠시 아래로 바꾼다 (Task 3에서 다시 손댄다):

```ts
  // 관리자 승격 경로가 사라졌는지는 admin_accounts 쓰기로 확인한다.
  assert.ok(
    (
      await db
        .from("admin_accounts")
        .insert({ id: user.id, name: "침입자", level: "owner" })
    ).error,
  );
```

그리고 돌린다:

```bash
npm run test:db
npm run test:integration
```

Expected: 모든 인테그레이션 테스트 PASS. 특히 `admin integration: admin CRUD is durable…`이 통과해야 한다 — 이것이 "판정 원천을 바꿔도 기존 호출부 24줄이 그대로 동작한다"의 증거다.

- [ ] **Step 11: PRD 데이터 모델을 갱신한다**

`docs/prd-ttokttok.md` §6에서 `profiles` 블록의 `role` 줄을 지우고 바로 위에 표를 더한다:

```
admin_accounts
  id PK FK auth.users, name, level ('owner'|'admin'),
  is_active bool, created_at, created_by FK admin_accounts
  -- 관리자 신원. profiles와 분리되어 관리자는 profiles 행을 갖지 않는다.
  -- 로그인 ID는 <id>@ttokttok.local 합성 이메일로 auth.users에 담는다.

profiles
  id PK FK auth.users, nickname, avatar_url, created_at
```

450행 근처의 "어드민 쓰기는 `role='admin'` 체크" 문장을 "어드민 쓰기(`books`, `posts`, `channels` 등)는 `is_admin()`(= `admin_accounts`에 활성 행이 있는가) 체크"로 고친다.

- [ ] **Step 12: 커밋한다**

```bash
git add supabase/migrations/20260911000002_admin_accounts.sql apps/admin/src/lib/admin-guard.ts "apps/admin/src/app/admin/login/page.tsx" scripts/create-admin.mjs scripts/test-db.mjs tests/live-db/fixtures.ts tests/live-db/admin.test.ts docs/prd-ttokttok.md
git commit -m "feat(db): move admin identity from profiles.role to admin_accounts"
```

---

## Task 3: `profiles.role` 제거와 소비처 정리

**Files:**
- Create: `supabase/migrations/20260911000003_drop_profiles_role.sql`
- Modify: `apps/client/src/lib/auth.ts:11-42`
- Modify: `apps/client/src/app/(main)/profile/page.tsx:143-147`
- Modify: `scripts/seed.mjs:588-593`
- Modify: `tests/live-db/admin.test.ts` (Task 2 Step 10의 임시 수정 확정)
- Modify: `packages/database/src/types.ts` (재생성)

**Interfaces:**
- Consumes: Task 2의 `admin_accounts` 표
- Produces: `CurrentUser = { id, nickname, avatarUrl }` — `role` 필드가 사라진다

- [ ] **Step 1: 마이그레이션을 쓴다**

`supabase/migrations/20260911000003_drop_profiles_role.sql`:

```sql
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
```

- [ ] **Step 2: 적용하고 실패를 확인한다**

```bash
node node_modules/supabase/dist/supabase.js --workdir .tmp/supabase-e2e db reset
npx tsc --noEmit -p apps/client/tsconfig.json
```

Expected: 마이그레이션은 성공하고, 타입체크는 `apps/client/src/lib/auth.ts`에서 `role`이 없다는 오류로 FAIL. 이것이 이번 단계가 고칠 대상이다.

> 타입 오류가 나지 않으면 `packages/database/src/types.ts`가 아직 옛 스키마다. Step 4에서 재생성한다.

- [ ] **Step 3: 클라이언트에서 `role`을 걷어낸다**

`apps/client/src/lib/auth.ts` — 타입과 반환값:

```ts
export type CurrentUser = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};
```

```ts
  const { data: profile } = await db
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    nickname: profile?.nickname ?? "독자",
    avatarUrl: profile?.avatar_url ?? null,
  };
```

`apps/client/src/app/(main)/profile/page.tsx` — 「관리자」 버튼 블록(143~147행)을 통째로 지운다. 관리자는 이제 클라이언트에 로그인할 수 없으므로 도달할 수 없는 코드다. 지운 뒤 `Link` import가 다른 곳에서도 쓰이는지 확인하고, 안 쓰이면 함께 지운다.

- [ ] **Step 4: 시드·테스트·타입을 맞춘다**

`scripts/seed.mjs` 588~593행의 승격 블록을 교체한다:

```js
      } else {
        // 관리자는 profiles가 아니라 admin_accounts에 등록한다. 시드는
        // 기존 소셜 계정을 승격시키는 용도라 프로필 행이 남아 있을 수 있다 —
        // 관리자는 프로필을 갖지 않으므로 함께 지운다.
        check(await db.from("profiles").delete().eq("id", user.id));
        const { error: upErr } = await db
          .from("admin_accounts")
          .upsert({ id: user.id, name: "관리자", level: "owner" });
        if (upErr) throw new Error(`admin_accounts: ${upErr.message}`);
        console.log(`✓ 관리자 승격: ${email}`);
      }
```

> `check`가 이 파일에 없으면 `const { error } = await db…; if (error) throw new Error(error.message);` 형태로 푼다.

`tests/live-db/admin.test.ts`는 Task 2 Step 10에서 이미 `admin_accounts` 기준으로 바꿨다. 테스트 이름이 아직 "promote their role"이면 "join admin_accounts"로 고친다.

타입을 재생성한다:

```bash
npm run db:types
```

- [ ] **Step 5: 전체 검증**

```bash
npm run build
npm run test:integration
npx vitest run
```

Expected: 셋 다 PASS. `build`가 실패하면 대개 `role`을 아직 읽는 곳이 남은 것이다 — `grep -rn "\.role\b" apps/ packages/ --include=*.ts --include=*.tsx`로 찾는다.

- [ ] **Step 6: 커밋한다**

```bash
git add supabase/migrations/20260911000003_drop_profiles_role.sql apps/client/src/lib/auth.ts "apps/client/src/app/(main)/profile/page.tsx" scripts/seed.mjs tests/live-db/admin.test.ts packages/database/src/types.ts
git commit -m "refactor: drop profiles.role now that admin_accounts owns the decision"
```

---

## Task 4: 클라이언트가 관리자 세션을 거부한다

관리자에게는 `profiles` 행이 없다. 그냥 두면 `getCurrentUser`의 `"독자"` 폴백 때문에 관리자가 일반 사용자로 보이다가 댓글을 쓰는 순간 FK 위반으로 깨진다.

**Files:**
- Modify: `apps/client/src/app/auth/callback/route.ts`
- Modify: `apps/client/src/lib/auth.ts` (`getCurrentUser`)
- Modify: `apps/client/src/app/(main)/login/page.tsx:8-12` (`ERROR_MESSAGES`)

**Interfaces:**
- Consumes: Task 2의 `admin_accounts_select_self` 정책 (본인 행 조회가 허용된다)
- Produces: 없음 (동작 변경만)

- [ ] **Step 1: 콜백에서 거부한다**

`apps/client/src/app/auth/callback/route.ts` — `exchangeCodeForSession` 성공 직후, `safeNext` 계산 앞에 넣는다:

```ts
  // 관리자 계정으로는 서비스를 이용할 수 없다 (설계 §6).
  //
  // 관리자는 profiles 행을 갖지 않으므로 그대로 두면 "독자"로 보이다가
  // 댓글을 쓰는 순간 FK 위반으로 깨진다 — 조용한 고장이다. 여기서 끊으면
  // 앞으로 추가될 모든 관리자에게 자동으로 적용된다.
  //
  // 합성 이메일(@ttokttok.local) 덕분에 새 관리자에게는 소셜 로그인 경로가
  // 애초에 열리지 않지만, 누군가 실수로 진짜 이메일을 ID로 쓰더라도 막힌다.
  const {
    data: { user },
  } = await db.auth.getUser();

  if (user) {
    const { data: adminAccount } = await db
      .from("admin_accounts")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (adminAccount) {
      await db.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=admin_account`);
    }
  }
```

- [ ] **Step 2: 2차 방어선을 둔다**

`apps/client/src/lib/auth.ts`의 `getCurrentUser`에서, 프로필이 없으면 `null`을 돌려준다:

```ts
  const { data: profile } = await db
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  // 프로필이 없으면 서비스 사용자가 아니다 — 관리자 계정이거나, 삭제된
  // 사용자의 잔여 세션이다. 게스트로 취급해 쓰기 경로에 닿지 않게 한다.
  //
  // 정상 사용자가 여기 걸리는 창은 없다: handle_new_user는 auth.users
  // INSERT의 after 트리거라 같은 트랜잭션 안에서 프로필을 만든다. 세션이
  // 존재하는 시점에는 프로필이 이미 있다. (이 전제가 깨지면 — 트리거를
  // 비동기로 바꾸는 등 — 이 처리도 같이 바뀌어야 한다.)
  if (!profile) return null;

  return {
    id: user.id,
    nickname: profile.nickname,
    avatarUrl: profile.avatar_url,
  };
```

> `nickname ?? "독자"` 폴백이 사라진 것이 의도다. 프로필이 있으면 `nickname`은 `not null`이다.

- [ ] **Step 3: 로그인 화면에 문구를 더한다**

`apps/client/src/app/(main)/login/page.tsx`의 `ERROR_MESSAGES`에 한 줄을 더한다:

```ts
const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "로그인이 완료되지 않았어요. 다시 시도해 주세요.",
  exchange_failed: "로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.",
  access_denied: "로그인을 취소하셨어요.",
  admin_account:
    "관리자 계정으로는 서비스를 이용할 수 없어요. 관리자 페이지에서 로그인해 주세요.",
};
```

이 화면의 폴백("로그인에 실패했어요")이 이미 있으므로 분기를 새로 만들지 않는다.

- [ ] **Step 4: 인테그레이션 테스트를 더한다**

`tests/live-db/client.test.ts` 끝에 추가:

```ts
test("client integration: an admin account has no profile row and cannot write user data", async () => {
  const { db, user } = await account("admin");

  // 관리자에게는 프로필이 없다 — 이것이 화면의 거부 판정 근거다.
  assert.equal(
    check(await db.from("profiles").select("id").eq("id", user.id)).data.length,
    0,
  );

  // 프로필이 없으니 사용자 데이터 쓰기는 FK에서 막힌다. 화면이 세션을
  // 거부하는 것과 별개로 DB도 같은 답을 준다.
  assert.ok(
    (await db.from("bookmarks").insert({ user_id: user.id, book_id: ids.book }))
      .error,
  );
});
```

`ids.book`은 `tests/live-db/fixtures.ts:10`에 있다. `account`·`check`·`ids`가 이 파일의 기존 import에 모두 포함돼 있는지 확인한다.

- [ ] **Step 5: 검증한다**

```bash
npm run test:integration
npm run build
```

Expected: PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add apps/client/src tests/live-db/client.test.ts
git commit -m "feat(client): reject admin sessions instead of breaking on the missing profile"
```

---

## Task 5: `/admin/accounts` — owner 전용 계정 관리

**Files:**
- Create: `apps/admin/src/app/admin/(dashboard)/accounts/page.tsx`
- Create: `apps/admin/src/app/admin/(dashboard)/accounts/actions.ts`
- Modify: `apps/admin/src/app/admin/(dashboard)/layout.tsx` (NAV에 조건부 항목)

**Interfaces:**
- Consumes: `requireOwner`, `readAdminAccess` (Task 2) · `adminIdToEmail`, `emailToAdminId`, `isValidAdminId` (Task 1) · `createAdminClient` (`@/lib/supabase/admin`)
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 서버 액션을 쓴다**

`apps/admin/src/app/admin/(dashboard)/accounts/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminIdToEmail, isValidAdminId } from "@ttokttok/shared/admin-id";
import { requireOwner } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 관리자 계정 관리 (설계 §7).
 *
 * 모든 액션이 requireOwner로 시작한다 — 서버 액션은 미들웨어를 거치지 않을
 * 수 있다. RLS도 owner만 쓰기를 허용하므로 이중이다.
 *
 * 계정 **생성**만 service role 클라이언트를 쓴다: auth.users에 행을 만드는
 * 것은 anon 키로 할 수 없다. 등급 변경·활성 토글은 일반 클라이언트로 하며
 * RLS가 판정한다 — 그래야 "자기 행은 못 바꾼다"가 DB에서 강제된다.
 */

export async function createAdminAccount(formData: FormData) {
  const { userId } = await requireOwner();

  const adminId = String(formData.get("adminId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const level = String(formData.get("level") ?? "admin");

  if (!isValidAdminId(adminId)) {
    redirect("/admin/accounts?error=invalid_id");
  }
  if (!name || password.length < 6) {
    redirect("/admin/accounts?error=required");
  }
  if (level !== "owner" && level !== "admin") {
    redirect("/admin/accounts?error=invalid_level");
  }

  const service = createAdminClient();
  const { data, error } = await service.auth.admin.createUser({
    email: adminIdToEmail(adminId),
    password,
    email_confirm: true,
    app_metadata: { ttokttok_admin: true },
  });

  if (error) {
    redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
  }

  // 트리거가 app_metadata 표식을 보고 건너뛰지만 보장이 없다. 이중으로 막는다.
  const { error: profErr } = await service
    .from("profiles")
    .delete()
    .eq("id", data.user.id);
  if (profErr) {
    redirect(`/admin/accounts?error=${encodeURIComponent(profErr.message)}`);
  }

  const { error: acctErr } = await service.from("admin_accounts").insert({
    id: data.user.id,
    name,
    level,
    created_by: userId,
  });

  if (acctErr) {
    // auth 계정만 남고 admin_accounts 행이 없으면 로그인은 되는데 아무 권한이
    // 없는 유령이 된다. 되돌린다.
    await service.auth.admin.deleteUser(data.user.id);
    redirect(`/admin/accounts?error=${encodeURIComponent(acctErr.message)}`);
  }

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?saved=1");
}

export async function setAdminActive(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  // 일반 클라이언트 — RLS가 "owner이고 자기 행이 아님"을 판정한다.
  const db = await createClient();
  const { error } = await db
    .from("admin_accounts")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/accounts");
  redirect(`/admin/accounts?${isActive ? "enabled" : "disabled"}=1`);
}

export async function setAdminLevel(formData: FormData) {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  const level = String(formData.get("level") ?? "");

  if (level !== "owner" && level !== "admin") {
    redirect("/admin/accounts?error=invalid_level");
  }

  const db = await createClient();
  const { error } = await db
    .from("admin_accounts")
    .update({ level })
    .eq("id", id);

  if (error) {
    redirect(`/admin/accounts?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/accounts");
  redirect("/admin/accounts?saved=1");
}
```

- [ ] **Step 2: 화면을 쓴다**

`apps/admin/src/app/admin/(dashboard)/accounts/page.tsx`:

```tsx
import type { Metadata } from "next";
import { emailToAdminId } from "@ttokttok/shared/admin-id";
import { Button } from "@ttokttok/ui/components/button";
import { Input } from "@ttokttok/ui/components/input";
import { Label } from "@ttokttok/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ttokttok/ui/components/table";
import { AdminNotice } from "@/components/admin/admin-notice";
import { AdminToast } from "@/components/admin/admin-toast";
import { requireOwner } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminAccount, setAdminActive, setAdminLevel } from "./actions";

export const metadata: Metadata = { title: "관리자 계정" };

const q = (v: string | string[] | undefined) =>
  typeof v === "string" ? v : undefined;

export default async function AdminAccountsPage({
  searchParams,
}: PageProps<"/admin/accounts">) {
  const sp = await searchParams;
  const { userId } = await requireOwner();

  const db = await createClient();
  const { data: accounts, error } = await db
    .from("admin_accounts")
    .select("id, name, level, is_active, created_at, created_by")
    .order("created_at");

  // 삼키면 실패가 빈 목록이 되어 "관리자가 나뿐"으로 읽힌다 (결정 기록 §11-61).
  if (error) throw new Error(error.message);

  // 로그인 ID와 마지막 로그인은 auth.users가 원천이다 — 복제하지 않고 여기서
  // 한 번 불러 메모리에서 붙인다 (설계 §5). 관리자 수는 한 자릿수다.
  const { data: authUsers, error: authError } = await createAdminClient()
    .auth.admin.listUsers({ perPage: 1000 });
  if (authError) throw new Error(authError.message);

  const byId = new Map(authUsers.users.map((u) => [u.id, u]));
  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  const rows = accounts.map((a) => {
    const authUser = byId.get(a.id);
    return {
      ...a,
      loginId: emailToAdminId(authUser?.email) ?? "—",
      lastSignInAt: authUser?.last_sign_in_at ?? null,
      createdByName: a.created_by ? (nameById.get(a.created_by) ?? "—") : "—",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">관리자 계정</h1>
        <p className="text-muted-foreground text-sm">
          어드민에 접근할 수 있는 계정입니다. owner만 이 화면을 볼 수 있습니다.
        </p>
      </header>

      <AdminNotice error={q(sp.error)} />
      <AdminToast
        message={
          q(sp.saved)
            ? "저장했습니다."
            : q(sp.disabled)
              ? "계정을 비활성화했습니다."
              : q(sp.enabled)
                ? "계정을 다시 활성화했습니다."
                : undefined
        }
      />

      <section className="border-border flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="text-sm font-medium">관리자 추가</h2>
        <form action={createAdminAccount} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="adminId">아이디</Label>
            <Input
              id="adminId"
              name="adminId"
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="ttokttok.editor"
              required
            />
            <p className="text-muted-foreground text-xs">
              소문자·숫자로 시작하는 3~32자. 점·하이픈·밑줄을 쓸 수 있습니다.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">이름</Label>
            <Input id="name" name="name" type="text" required />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="level">등급</Label>
            <select
              id="level"
              name="level"
              defaultValue="admin"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="admin">admin — 콘텐츠 업무</option>
              <option value="owner">owner — 관리자 계정까지 관리</option>
            </select>
          </div>

          <Button type="submit" className="min-h-11 self-start">
            추가
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">목록</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>아이디</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>등급</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마지막 로그인</TableHead>
                <TableHead>추가한 사람</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                // 자기 행은 RLS가 막는다. 누를 수 있게 두면 화면이 거짓말을 한다.
                const isSelf = row.id === userId;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {row.loginId}
                    </TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.level}</TableCell>
                    <TableCell>
                      {row.is_active ? (
                        "활성"
                      ) : (
                        <span className="text-destructive">비활성</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.lastSignInAt
                        ? new Date(row.lastSignInAt).toLocaleString("ko-KR")
                        : "기록 없음"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.createdByName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <form action={setAdminLevel}>
                          <input type="hidden" name="id" value={row.id} />
                          <input
                            type="hidden"
                            name="level"
                            value={row.level === "owner" ? "admin" : "owner"}
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                          >
                            {row.level === "owner" ? "admin으로" : "owner로"}
                          </Button>
                        </form>
                        <form action={setAdminActive}>
                          <input type="hidden" name="id" value={row.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={row.is_active ? "false" : "true"}
                          />
                          <Button
                            type="submit"
                            variant={row.is_active ? "destructive" : "secondary"}
                            size="sm"
                            disabled={isSelf}
                          >
                            {row.is_active ? "비활성화" : "활성화"}
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground text-xs">
          자기 계정의 등급과 활성 상태는 바꿀 수 없습니다 — 마지막 owner가 스스로를
          내리면 아무도 관리자를 추가할 수 없게 됩니다.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 내비에 owner 전용 항목을 더한다**

`apps/admin/src/app/admin/(dashboard)/layout.tsx`에서 `requireAdmin()` 호출이 등급을 돌려주므로 그것을 받아 쓴다:

```tsx
  const { level } = await requireAdmin();

  const nav = level === "owner"
    ? [...NAV, { href: "/admin/accounts", label: "계정" }]
    : NAV;
```

그리고 `NAV.map(...)`을 `nav.map(...)`으로 바꾼다. `NAV`의 `as const`는 그대로 두되, 전개했을 때 타입이 좁아 오류가 나면 선언을 아래로 바꾼다:

```tsx
const NAV: readonly { href: string; label: string }[] = [
  { href: "/admin/books", label: "도서" },
  { href: "/admin/posts", label: "게시물" },
  { href: "/admin/channels", label: "채널" },
  { href: "/admin/featured", label: "추천" },
  { href: "/admin/reports", label: "신고" },
];
```

- [ ] **Step 4: RLS가 실제로 막는지 인테그레이션 테스트로 확인한다**

`tests/live-db/admin.test.ts` 끝에 추가:

```ts
test("admin integration: an owner cannot demote or disable their own row", async () => {
  const { db, user } = await account("admin"); // 픽스처의 관리자는 owner다

  // 자기 행 수정은 RLS가 막는다. 없으면 마지막 owner가 스스로를 내려
  // 아무도 관리자를 추가할 수 없는 잠긴 상태를 만들 수 있다.
  assert.ok(
    (
      await db
        .from("admin_accounts")
        .update({ level: "admin" })
        .eq("id", user.id)
        .select()
    ).data?.length === 0,
  );

  assert.equal(
    check(
      await db
        .from("admin_accounts")
        .select("level, is_active")
        .eq("id", user.id)
        .single(),
    ).data.level,
    "owner",
  );
});
```

> RLS가 막은 `update`는 오류가 아니라 **0행 영향**으로 나타난다. `.select()`를 붙여 영향받은 행을 세는 것이 그래서다.

- [ ] **Step 5: 검증한다**

```bash
npm run test:integration
npm run build
```

Expected: PASS.

브라우저로 실제 렌더를 확인한다 — 어드민 개발 서버를 띄우고 `http://localhost:3001/admin/accounts`를 375px 뷰포트에서 연다. 표가 가로 스크롤 안에 갇히고 페이지 자체는 가로로 넘치지 않아야 한다.

- [ ] **Step 6: 커밋한다**

```bash
git add "apps/admin/src/app/admin/(dashboard)/accounts" "apps/admin/src/app/admin/(dashboard)/layout.tsx" tests/live-db/admin.test.ts
git commit -m "feat(admin): add owner-only admin account management screen"
```

---

## Task 6: E2E · 문서 · 최종 검증

**Files:**
- Modify: `e2e/helpers.ts:98-108` (`adminLogin`)
- Create: `e2e/admin.accounts.spec.ts`
- Modify: `docs/prd-ttokttok.md` §5.10, 결정 기록 §11-33 정정 + §11-69 신규

**Interfaces:**
- Consumes: 앞의 모든 작업
- Produces: 없음

- [ ] **Step 1: E2E 로그인 헬퍼를 ID 방식으로 바꾼다**

`e2e/helpers.ts`의 `adminLogin`:

```ts
export async function adminLogin(page: Page) {
  await page.goto("http://localhost:3001/admin/login");
  await page
    .getByLabel("아이디", { exact: true })
    .fill(process.env.TEST_ADMIN_ID!);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
```

- [ ] **Step 2: 계정 화면 E2E를 쓴다**

`e2e/admin.accounts.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { adminLogin, stablePage } from "./helpers";

test("owner는 계정 화면에서 관리자를 보고 자기 행은 못 바꾼다", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto("http://localhost:3001/admin/accounts");
  await stablePage(page);

  await expect(
    page.getByRole("heading", { name: "관리자 계정" }),
  ).toBeVisible();

  // 로그인한 본인 행의 컨트롤은 비활성이어야 한다 — RLS가 막는 동작을
  // 누를 수 있게 두면 화면이 거짓말을 한다.
  const selfRow = page.getByRole("row", { name: /테스트 관리자/ });
  await expect(selfRow.getByRole("button", { name: "비활성화" })).toBeDisabled();
});

test("계정 화면이 375px에서 가로로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await adminLogin(page);
  await page.goto("http://localhost:3001/admin/accounts");
  await stablePage(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 3: 전체 검증을 돌린다**

```bash
npm run build
npx vitest run
npm run test:integration
npx playwright test
```

Expected: 빌드·단위·인테그레이션은 전부 PASS. E2E가 실패하면 `docs/monorepo-testing.md`의 절차대로 두 앱 개발 서버가 3000·3001에 떠 있는지 먼저 확인한다.

**디자인 회귀에서 `@visual admin login`은 반드시 어긋난다** — 그 스냅샷(`e2e/admin.visual.spec.ts:7-9`)에 「이메일」 라벨이 찍혀 있는데 이번에 「아이디」로 바뀌었다. **이 차이는 의도된 것이고, 베이스라인을 다시 찍어 덮으면 안 된다.** `scripts/visual-baseline.mjs`는 마이그레이션 이전 앱(`.tmp/monorepo-baseline`)에서만 캡처하도록 만들어져 있고 `e2e/baselines/README.md`가 "Never update these images from the migrated app to suppress differences"라고 못 박고 있다.

해야 할 일은 **차이가 라벨 한 곳뿐임을 확인하는 것**이다. Playwright가 남긴 diff 이미지를 열어 입력 필드 라벨 외에 레이아웃·색·간격이 움직이지 않았는지 본다. 다른 곳이 함께 움직였다면 그건 의도치 않은 회귀이므로 고친다. 확인 결과를 Step 4의 §11-69에 한 문장으로 남긴다.

- [ ] **Step 4: PRD를 갱신한다**

`docs/prd-ttokttok.md` §5.10의 접근 줄:

```
- **접근**: `admin_accounts`에 활성 행이 있는 계정만. 로그인 ID는 이메일이 아니며(`ttokttok.admin`), 내부적으로 `<id>@ttokttok.local` 합성 이메일로 `auth.users`에 담는다. 미들웨어에서 라우트 보호, 화면·서버 액션은 `requireAdmin()`, 최종 방어선은 RLS.
- **관리자 계정 관리** (`/admin/accounts`, owner 전용): 목록(아이디·이름·등급·활성·마지막 로그인·추가한 사람) · 추가 · 비활성화 · 등급 변경. 자기 행의 등급·활성은 바꿀 수 없다.
```

결정 기록 §11-33을 정정한다 (기존 줄 끝에 이어 붙인다):

```
**→ §11-69로 정정** (2026-09-11): 관리자 신원이 `profiles.role`에서 `admin_accounts`로 분리됐고, 로그인 ID가 이메일이 아니게 됐다.
```

§11-69을 새로 더한다:

```
| 69 | 관리자 계정을 사용자와 분리 | **관리자 신원을 `admin_accounts`로 옮기고 로그인 ID를 합성 이메일에 맵핑한다**(2026-09-11). 문제는 가설이 아니었다 — 프로덕션 identity 타임스탬프가 경위를 그대로 보여준다: `create-admin.mjs`가 2026-08-27에 email identity만으로 만든 관리자 계정에 **2026-09-01 google identity가 저절로 붙었고**(`email_confirm: true`라 Supabase가 같은 주소의 소셜 로그인을 기존 계정에 자동 연결한다), 그 결과 운영 계정이 서비스 사용자로 댓글 2건·진행률 5건을 남겼다. **연결을 수동으로 끊어도 구글 버튼 한 번이면 되돌아온다** — 그래서 운영 규칙이 아니라 구조로 막았다: 관리자 로그인 ID를 `ttokttok.admin` 형태로 두고 `@ttokttok.local`(라우팅되지 않는 도메인)을 붙여 `auth.users`에 담는다. **그 주소의 구글·카카오 계정은 존재할 수 없으므로 자동 연결의 전제 자체가 사라진다.** 신원을 `auth.users` 밖으로 빼지 않은 것이 핵심 제약이었다 — 빼면 `auth.uid()`가 null이 되어 `is_admin()`을 부르는 기존 마이그레이션 5개의 **24줄**(실측 2026-09-11 — 대부분 RLS 정책, 일부는 RPC 함수 본문)이 관리자를 영원히 거부하고 어드민의 모든 쓰기가 service role 우회가 된다("보안은 RLS가 담당"이 무너진다). 대신 **`is_admin()` 함수 본문만 교체**해 판정 원천을 갈아 끼웠다: 정책은 한 곳도 바뀌지 않았다. JWT 클레임 방식은 기각했다 — 빠르지만 비활성화가 토큰 만료 전까지 안 먹어 "사고 난 계정을 당장 막는다"가 깨진다. 등급은 `owner`/`admin` 2단계이고, **owner는 자기 행의 등급·활성을 바꿀 수 없다**: 없으면 마지막 owner가 스스로를 내리는 순간 아무도 관리자를 추가할 수 없는 잠긴 상태가 된다. `update` 정책에 `using`과 `with check`를 둘 다 둔 것도 같은 이유다(§11의 comment_threads·comment_likes가 겪은 함정). 기존 `bucheongosok@gmail.com`은 **관리자에서 내려 일반 사용자로 남겼다**(사용자 결정) — 따라서 이관도 cascade 삭제도 없고, 닉네임 "관리자"만 사칭이 되지 않게 중립값으로 바꿨다. 관리자는 `profiles` 행을 갖지 않으므로 클라이언트는 관리자 세션을 감지하면 로그아웃시킨다 — 그냥 두면 `getCurrentUser`의 "독자" 폴백 때문에 일반 사용자로 보이다가 댓글을 쓰는 순간 FK 위반으로 깨진다. **비밀번호는 `admin123`을 쓴다**(사용자 결정, 위험을 알린 뒤 재확인) — 정식 오픈 전 교체해야 하며, `create-admin.mjs`에 인자 없이 실행하면 난수 비밀번호를 발급한다. 설계: `docs/superpowers/specs/2026-09-11-admin-accounts-design.md` |
```

Task 2 Step 4에서 실측한 트리거 결과(프로필이 생겼는지)를 이 항목에 한 문장으로 더한다.

- [ ] **Step 5: 커밋한다**

```bash
git add e2e/helpers.ts e2e/admin.accounts.spec.ts docs/prd-ttokttok.md
git commit -m "test: cover admin account management end to end and record the decision"
```

---

## 프로덕션 배포 순서

**순서를 지키지 않으면 `/admin`에 아무도 못 들어간다.** 마이그레이션 직후 관리자는 0명이고,
반대로 **앱을 마이그레이션보다 먼저 배포하면 들어갈 길 자체가 사라진다** — `readAdminAccess()`
(`apps/admin/src/lib/admin-guard.ts`)가 `admin_accounts`를 읽다 표가 없어 던지는데, 로그인 화면
(`/admin/login`)도 그 함수를 부른다. 관리자 쿠키가 남아 있으면 로그인 화면부터 500이고, 로그인에
성공해도 `/admin` 레이아웃의 `requireAdmin()`이 같은 자리에서 던져 500이다. 그래서 순서는 언제나
**마이그레이션 → `create-admin.mjs` → 앱 배포**다 (사전 병합 리뷰 지적).

### 이미 적용해 둔 것 — 운영 `jrabwetgciulczhnoxxi`, 2026-09-11

두 마이그레이션은 **확장-축소(expand/contract)** 라 한 번에 넣지 않았다. **확장 단계인
`20260911000002_admin_accounts`만 적용했고 `20260911000003_drop_profiles_role`은 일부러 미뤘다** —
지금 배포돼 있는 master의 `apps/client/src/lib/auth.ts`가 아직 `.select("nickname, avatar_url, role")`
을 하므로, 컬럼을 먼저 드롭하면 42703으로 라이브 사용자 앱의 `getCurrentUser()`가 통째로 깨진다.
따라서 `supabase migration list`에 `0003`이 아직 비어 있는 것은 **정상이며 어긋난 원장이 아니다**.

`0002`가 `is_admin()`을 `profiles.role`이 아니라 `admin_accounts`를 보도록 바꿔 놓았으므로, 그 사이에도
배포된 master가 계속 관리자로 동작하도록 `admin_accounts`에 owner 두 행을 넣어 두었다:

| id | 정체 | 수명 |
|---|---|---|
| `aec48cff-2e10-4f61-96db-f578b81ff096` | 기존 구글 관리자 `bucheongosok@gmail.com` | **임시 브리지** — 이 브랜치가 배포되면 제거한다 |
| `872b7dd4-…` | `ttokttok.admin@ttokttok.local` (`create-admin.mjs`가 만든 첫 owner) | 영구 |

### 머지할 때 — 두 가지를 같이 한다

1. `0003`을 적용하기 **직전에** 백업을 받는다. 되돌리려면 `profiles.role` 값이 필요한데 drop 뒤에는 남지 않는다.
2. `feat/admin-accounts`를 master에 머지한다.
3. **두 Vercel 앱(`ttokttok`·`ttokttok-admin`)이 모두 새 커밋으로 배포된 것을 확인한 뒤에** 축소 단계를
   진행한다 — 같은 커밋의 두 빌드가 원자적으로 바뀌지 않는다(`docs/monorepo-deployment.md`):
   - 원장이 실제 적용 상태와 어긋나 있는지(예: 대시보드로 직접 적용한 이력) 먼저 `supabase migration
     list`로 확인한다. 어긋나 있다면 **push보다 먼저** `supabase migration repair`로 맞춘다 — 어긋난
     원장으로 push하면 그 push 자체가 실패한다(사전 병합 리뷰 지적: repair는 push의 사후 정리가
     아니라 사전 조건이다).
   - `admin_accounts`에서 `aec48cff-2e10-4f61-96db-f578b81ff096` 행을 제거한다. 기존 구글 계정은 관리자에서
     내려 일반 사용자로 남긴다는 결정(결정 기록 §11-69)을 그제서야 실제로 반영하는 것이다.
   - `supabase db push --linked --include-all`로 적용한다. 배포된 코드가 더는 `profiles.role`을 읽지
     않게 된 뒤여야 한다. **주의:** `--include-all`은 `0003`(`drop_profiles_role`)만 수술적으로 골라
     넣지 않는다 — 이 시점까지 아직 적용되지 않은 마이그레이션이 있다면(예: 이 문서 작성 이후 머지된
     `20260912000001_book_cover_design_images`·`20260912000002_channel_cover`) 그것들도 같이 들어간다.
     이 저장소는 그 상태를 의도한 것으로 두었다 — `0003`만 골라 넣으려면 `--include-all` 대신
     `supabase db push --linked <0003의 마이그레이션 이름>`처럼 대상을 명시할 것.
4. `/admin/login`에서 `ttokttok.admin` / `admin123`으로 로그인 확인.
5. 클라이언트에서 `bucheongosok@gmail.com` 구글 로그인이 **정상 사용자로** 들어가는지 확인한다 (이제 관리자가 아니므로 거부되면 안 된다).
