# 관리자 계정을 사용자와 분리한다 — 설계

2026-09-11 확정. 사용자 요청: "관리자 계정 테이블도 필요할 거 같아. 유저 테이블과 별개로".

## 1. 왜 — 실측한 문제

지금은 `profiles`(= `auth.users` 1:1)의 `role` 컬럼 하나가 관리자를 가른다. 관리자도
서비스 사용자와 같은 표의 한 행이다. 프로덕션(`jrabwetgciulczhnoxxi`)을 읽어 확인한
실제 상태:

```
auth.users 2명
  aec48cff… bucheongosok@gmail.com  providers=["email","google"]  role=admin  nickname="관리자"
  78c9e4e7… blackstarzck@naver.com  providers=["kakao"]           role=user   nickname="김찬기"

관리자 계정에 딸린 사용자 데이터
  comments          2행  "댓글 남겨지나요" / "우왕"  (2026-09-02)
  reading_progress  5행
  analytics_events  5행
```

**운영 계정이 서비스 사용자로 활동했다.** 그리고 그건 실수가 아니라 구조가 시킨 일이다.
identity 타임스탬프가 경위를 그대로 보여준다:

```
계정 생성   2026-08-27T09:15:50Z   ← create-admin.mjs (email identity만)
email       2026-08-27T09:15:50Z
google      2026-09-01T08:07:15Z   ← 5일 뒤, 아무도 연결한 적 없는데 생겼다
```

`create-admin.mjs`가 `email_confirm: true`로 계정을 만들기 때문에, 누군가 클라이언트에서
같은 주소로 구글 로그인을 누른 순간 Supabase가 **기존 관리자 계정에 자동으로 identity를
붙였다**. 즉 관리자 이메일이 구글·카카오 계정이기만 하면 이 일은 언제든 반복되고,
연결을 수동으로 끊어도 버튼 한 번이면 되돌아온다.

해결해야 할 것은 네 가지다 — 운영 흔적 분리, 관리자 전용 정보를 둘 자리, 권한 등급,
그리고 사용자 인증과의 신원 분리.

## 2. 무엇을 하지 않는가

**인증 체계 자체는 갈지 않는다.** 관리자를 `auth.users` 밖으로 빼면 `auth.uid()`가 null이
되어 `is_admin()`을 부르는 기존 마이그레이션 5개의 **24줄**이 관리자를 영원히 거부하고 (설계 당시 "28곳(8개 마이그레이션)"으로 적었으나 선언·주석을 포함한 수였다 — 2026-09-11 실측 정정), 어드민의 모든 쓰기가
service role 키 우회로 바뀐다 — AGENTS.md의 "보안은 RLS가 담당, service role은 서버 전용"이
무너진다. 반대로 얻는 것은 없다: 자격증명을 아는 사람은 어차피 `/admin`으로 들어온다.

그래서 **신원은 `auth.users`에 남기고, 계정 정보와 권한만 별도 표로 옮긴다.**

## 3. 접근 방식 — `is_admin()` 본문만 교체

| 안 | 내용 | 판단 |
|---|---|---|
| **A. `is_admin()` 본문 교체** | `create or replace`로 함수 안쪽이 `admin_accounts`를 읽게 한다. 호출부 24줄은 한 글자도 안 바뀐다 | **채택** |
| B. JWT 클레임 | `app_metadata`에 넣고 `auth.jwt()`로 읽는다. 조회가 사라져 빠르다 | 기각 — 비활성화가 **토큰 만료 전까지 안 먹는다**. "사고 난 계정을 당장 막는다"가 깨진다 |
| C. 정책 전면 재작성 | 24줄이 `admin_accounts`를 직접 참조 | 기각 — 비용만 크고 얻는 게 없다 |

`is_admin()`이 이미 추상화 경계 역할을 하고 있어서, 관리자 판정의 **원천만 갈아 끼우면**
된다. 이것이 이 설계 전체를 작은 변경으로 만드는 핵심이다.

## 4. 로그인 ID — 이메일이 아니다

관리자 로그인 ID는 **`ttokttok.admin`** 형태로, 이메일 형식이 아니다 (사용자 결정).

Supabase Auth의 `signInWithPassword`는 이메일이나 전화번호만 받는다. 그래서
**표시되는 ID는 `ttokttok.admin`, 내부 저장은 합성 이메일 `ttokttok.admin@ttokttok.local`**로
맵핑한다. 로그인 폼이 도메인을 붙이고, 관리자는 이메일을 볼 일이 없다.

**이 선택이 §1의 자동 연결 문제를 구조적으로 끝낸다.** `@ttokttok.local`은 라우팅되지 않는
도메인이라 그 주소의 구글·카카오 계정이 **존재할 수 없다** — 자동 identity 연결의 전제
자체가 사라진다. 운영 규칙이 아니라 불가능이 된다.

맵핑은 `packages/shared/src/admin-id.ts`에 둔다 (React·Next·DOM·네트워크 의존 없음,
AGENTS.md 모노레포 경계 준수). 두 앱과 스크립트가 같은 함수를 쓴다.

```ts
export const ADMIN_EMAIL_DOMAIN = "ttokttok.local";
export function adminIdToEmail(id: string): string;
export function emailToAdminId(email: string): string | null;
export function isValidAdminId(id: string): boolean;  // /^[a-z0-9][a-z0-9._-]{2,31}$/
```

`isValidAdminId`가 필요한 이유: 검증 없는 ID를 그대로 이어 붙이면 `a@b.com` 같은 입력이
`a@b.com@ttokttok.local`이 되거나, 대문자·공백이 섞여 같은 사람이 두 계정을 갖는다.
콜로케이트 테스트(`admin-id.test.ts`)로 검증한다 — 이 저장소의 테스트 정책이 순수 함수만
테스트하는데, 이 모듈이 정확히 거기 해당한다.

## 5. 스키마 — `20260911000002_admin_accounts.sql`

```sql
create table public.admin_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,                    -- 운영자 이름. profiles.nickname과 무관
  level text not null default 'admin' check (level in ('owner', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_accounts (id) on delete set null
);
```

**이메일(로그인 ID)과 마지막 로그인 시각은 일부러 넣지 않는다.** 둘 다 `auth.users`에
이미 있고, 복제하면 원천이 둘이 되어 어긋난다 — 그리고 어긋났을 때 어느 쪽이 진실인지
알 방법이 없다. `/admin/accounts`는 이미 service role 클라이언트를 갖고 있으니 렌더할 때
`listUsers()` 한 번으로 조인한다. 관리자 수는 한 자릿수다.

`created_by`가 `set null`인 이유: 계정을 만든 사람이 나중에 삭제돼도 나머지 행은 남아야
한다. 누가 만들었는지 모르게 되는 것은 그 행을 잃는 것보다 낫다.

### 판정 함수

```sql
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.admin_accounts
    where id = auth.uid() and is_active
  );
$$;

create function public.is_admin_owner()  -- 같은 형태, level = 'owner' and is_active
```

`security definer`라 `admin_accounts`의 RLS를 우회한다 — 기존 `is_admin()`과 같은 패턴이고
재귀가 없다. **`is_active = false`가 곧 즉시 차단**이다: 다음 요청부터 28개 정책이 전부
거부한다. 이것이 "비활성화"의 실제 의미이며, B안을 기각한 이유다.

### `admin_accounts`의 RLS

| 정책 | 대상 | 조건 |
|---|---|---|
| `select_self` | authenticated | `id = auth.uid()` — 클라이언트가 "이 세션은 관리자다"를 판정하는 근거 |
| `select_all` | authenticated | `public.is_admin()` — 누가 접근 권한을 갖는지 관리자끼리는 볼 수 있다 |
| `insert` / `update` | authenticated | `public.is_admin_owner()` **그리고 `id <> auth.uid()`** |

마지막 조항이 중요하다. 없으면 유일한 owner가 자기를 admin으로 내리거나 비활성화하는
순간 **아무도 관리자를 추가할 수 없는 잠긴 상태**가 된다. 자기 행의 `level`·`is_active`는
바꿀 수 없고, 다른 owner만 바꿀 수 있다. (`delete` 정책은 두지 않는다 — 계정은 지우지 않고
`is_active`로 끈다. 지우면 `created_by` 이력이 끊긴다.)

**`update` 정책에는 `using`과 `with check`를 **둘 다** 쓴다.** `using`만 두면 "바꿀 수 있는
행"만 정해지고 "바꾼 뒤의 값"은 검사되지 않아, owner가 **다른 owner의 행을 골라 그 행의
`id`를 자기 것으로 바꾸는** 식의 우회가 열린다. 이 저장소는 같은 함정을 이미 한 번 겪었다
(`20260902000001_comment_threads.sql`·`20260903000001_comment_likes.sql`의 주석 참조).

### 프로필 생성 트리거

`handle_new_user`가 `auth.users` INSERT마다 `profiles` 행을 만든다. 관리자에게는 만들면
안 된다. `raw_app_meta_data`에 표식을 넣어 트리거가 건너뛰게 하되, **계정 생성 경로가
직후에 `profiles` 행을 한 번 더 지운다** — GoTrue가 `app_metadata`를 INSERT에 함께 넣는지는
문서로 보장된 바가 없다. 구현 시 로컬 DB에서 실측하고, 실측 결과와 무관하게 이중 방어를
남긴다.

### 기존 데이터 이관

`bucheongosok@gmail.com`은 **더 이상 관리자가 아니다** (사용자 결정). 일반 사용자로 남는다.

```sql
-- 관리자였던 계정의 닉네임을 중립적인 값으로. "관리자"로 댓글에 표시되면 사칭이 된다.
update public.profiles
   set nickname = '독자-' || left(id::text, 8)
 where role = 'admin';

alter table public.profiles drop column role;
```

- **`admin_accounts`로 옮기는 행은 없다.** 따라서 cascade 삭제도 없다 — 댓글 2건·진행률
  5건·이벤트 5건은 일반 사용자의 데이터이므로 보존한다.
- 구글 연결도 그대로 둔다. 일반 사용자에게는 정상이다.
- 닉네임 폴백은 `handle_new_user`가 이미 쓰는 값과 같은 형태다. 본인이 앱에서 언제든
  바꿀 수 있다.
- 마이그레이션 직후 **관리자가 0명**이 된다. 부트스트랩이 배포 순서의 일부다 (§9).

## 6. 클라이언트 — 관리자 세션 거부

관리자 계정으로는 서비스를 이용할 수 없다. `getCurrentUser`가 프로필 없는 사용자를
닉네임 `"독자"`로 폴백하므로([auth.ts:38](../../../apps/client/src/lib/auth.ts)), 그냥
두면 관리자가 **"독자"로 보이다가 댓글을 쓰는 순간 FK 위반으로 깨지는 조용한 고장**이 된다.

| 위치 | 처리 |
|---|---|
| `auth/callback/route.ts` | 세션 교환 직후 본인 `admin_accounts` 행 조회 → 있으면 `signOut()` 후 `/login?error=admin_account` |
| `getCurrentUser()` | `profiles` 행이 없으면 `null` — 변경 전에 발급된 세션에 대한 2차 방어선 |

| `login` 화면 | `error=admin_account`에 "관리자 계정으로는 서비스를 이용할 수 없습니다" |
| `CurrentUser.role` | 제거 |
| `profile/page.tsx:143` 「관리자」 버튼 | 제거 — 관리자가 로그인할 수 없으니 도달 불가 코드가 된다 |

합성 이메일(§4) 덕분에 새 관리자에게는 이 경로가 애초에 열리지 않지만, 코드로 막아 두면
**앞으로 추가될 모든 관리자에게 자동으로 적용된다** — 누군가 실수로 진짜 이메일을 ID로
쓰더라도.

`getCurrentUser()`에서 "프로필 없음 = 서비스 사용자 아님"이 성립하는 근거: `handle_new_user`는
`auth.users` INSERT의 `after` 트리거라 **같은 트랜잭션 안에서** 프로필을 만든다. 즉 소셜
가입 직후라 해도 세션이 존재하는 시점에는 프로필이 이미 있다 — 정상 사용자가 잠깐
`null`로 보이는 창은 없다. 이 전제가 깨지면(트리거를 비동기로 바꾸는 등) 이 처리도
같이 바뀌어야 한다.

## 7. 어드민

### 가드

`admin-guard.ts`가 `profiles.role` 대신 `admin_accounts`를 읽는다. `readAdminAccess()`는
`{ userId, isAdmin, level }`을 돌려주고, `requireAdmin()`은 그대로, **`requireOwner()`**를
더한다. 조회 실패를 삼키지 않는 기존 규약(결정 기록 §11-61)은 유지한다.

### 로그인 화면

`이메일` 라벨을 **`아이디`**로 바꾸고, 제출 시 `adminIdToEmail()`로 변환해
`signInWithPassword`에 넘긴다. `type="email"`·`autoComplete="username"`은 각각 `text`와
`username`이 된다.

### `/admin/accounts` (owner 전용)

- **목록**: 아이디 · 이름 · 등급 · 활성 · 마지막 로그인 · 추가한 사람.
  `admin_accounts` 조회 + `listUsers()` 한 번을 메모리에서 조인한다.
- **추가**: 아이디 · 이름 · 등급 · 비밀번호 입력 → `auth.admin.createUser`(합성 이메일,
  `email_confirm: true`) → `admin_accounts` insert → `profiles` 행 정리.
- **비활성화 / 재활성화**, **등급 변경**. 자기 행에서는 두 컨트롤 모두 비활성 상태로
  보여 준다 — 눌러도 RLS가 막지만, 막힐 것을 누를 수 있게 두면 UI가 거짓말을 한다.
- 사이드바 메뉴는 owner에게만 보인다.

모든 서버 액션은 `requireOwner()`를 먼저 부른다. 최종 방어선은 RLS다.

## 8. 스크립트와 테스트

- **`scripts/create-admin.mjs`** — `ADMIN_EMAIL` → `ADMIN_ID`(기본값 `ttokttok.admin`).
  합성 이메일로 계정을 만들고 `admin_accounts`에 **owner**로 넣은 뒤 `profiles` 행을
  지운다. 화면이 생겨도 이 스크립트는 남는다: **첫 owner를 만들 경로가 달리 없다.**
- **`scripts/seed.mjs:590`** — `role: "admin"` 갱신을 `admin_accounts` insert로 교체.
- **`packages/database/src/types.ts`** — `npm run db:types`로 재생성.
- **`e2e/helpers.ts:98`** `adminLogin` — `TEST_ADMIN_EMAIL` → `TEST_ADMIN_ID`,
  `getByLabel("이메일")` → `getByLabel("아이디")`.
- **새 E2E**: owner가 아닌 관리자에게 `/admin/accounts`가 막히는가 · 비활성화된 계정이
  즉시 거부되는가 · 관리자 세션이 클라이언트에서 거부되는가.

## 9. 배포 순서

순서를 지키지 않으면 `/admin`에 아무도 못 들어간다.

1. 마이그레이션 적용 → 이 시점에 관리자 0명
2. `node --env-file=.env scripts/create-admin.mjs admin123` → 첫 owner 생성
3. `/admin/login`에서 `ttokttok.admin` / `admin123`로 로그인 확인
4. 대시보드에서 적용했다면 **즉시 `supabase migration repair`** — 원장이 어긋나면 다음
   작업이 막힌다

프로덕션 적용 전 백업을 받는다. 되돌리려면 `admin_accounts`를 지우고 `profiles.role`을
복구해야 하는데, `role`은 drop된 뒤라 값이 남지 않는다.

## 10. 전제 — 비밀번호

**`admin123`을 프로덕션 포함 모든 환경에서 쓴다** (사용자 결정, 위험을 알린 뒤 재확인).

이 계정은 모든 콘텐츠를 쓰고 지우며, 신고·분석 데이터를 읽는다. 로그인 화면은 공개돼
있고 ID도 추측 가능하다. 지금은 실사용자가 1명이고 정식 오픈 전이라는 판단이다.
**정식 오픈 전에 교체해야 한다** — `create-admin.mjs`에 인자 없이 실행하면 난수 비밀번호를
만들어 한 번만 출력하는 경로가 이미 있다.

## 11. 완료 기준

- `npm run build` 통과 (타입체크 포함)
- 두 앱의 E2E · 실제 로컬 DB 인테그레이션 · 디자인 회귀 (`docs/monorepo-testing.md`)
- `/admin/accounts`를 375px에서 실제 렌더 확인
- 문서 갱신을 같은 커밋에: PRD §5.10(접근) · §6(데이터 모델) · 결정 기록 §11-33 정정 +
  **§11-69 신규**
