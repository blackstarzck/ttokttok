import { describe, expect, it } from "vitest";
import {
  ADMIN_EMAIL_DOMAIN,
  adminIdToEmail,
  emailToAdminId,
  isValidAdminId,
} from "./admin-id";

describe("관리자 ID 형식", () => {
  // 길이 경계 — 패턴은 1(첫 글자) + {2,31} = 3~32자다. 하한(abc, 3자)과
  // 상한(32자)을 직접 고정해 둔다 — 33자(아래 거부 목록의 "a".repeat(33))는
  // 이미 거부로 잡혀 있지만 32자가 받아들여지는 쪽은 지금까지 아무 테스트도
  // 짚지 않았다.
  it.each([
    "ttokttok.admin",
    "admin",
    "a-b_c.d",
    "abc123",
    "abc",
    "a".repeat(32),
  ])("받아들인다: %s", (id) => {
    expect(isValidAdminId(id)).toBe(true);
  });

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
