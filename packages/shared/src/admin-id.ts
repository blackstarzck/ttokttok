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
