import {
  test,
  expect,
  adminLogin,
  adminOrigin,
  stablePage,
} from "./helpers";

test("owner는 계정 화면에서 관리자를 보고 자기 행은 못 바꾼다", async ({
  page,
}) => {
  await adminLogin(page);
  await page.goto(`${adminOrigin()}/admin/accounts`);
  await stablePage(page);

  await expect(page.getByRole("heading", { name: "관리자 계정" })).toBeVisible();

  // 로그인한 본인 행의 컨트롤은 비활성이어야 한다 — RLS가 막는 동작을
  // 누를 수 있게 두면 화면이 거짓말을 한다.
  const selfRow = page.getByRole("row", { name: /테스트 관리자/ });
  await expect(selfRow.getByRole("button", { name: "비활성화" })).toBeDisabled();
  await expect(
    selfRow.getByRole("button", { name: "admin으로" }),
  ).toBeDisabled();

  // 남의 행은 눌러야 한다 — 자기 행만 보고 끝내면 "전부 비활성"인 고장과
  // 구별되지 않는다.
  const otherRow = page.getByRole("row", { name: /테스트 스태프 관리자/ });
  await expect(otherRow.getByRole("button", { name: "비활성화" })).toBeEnabled();
});

test("계정 화면이 375px에서 가로로 넘치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await adminLogin(page);
  await page.goto(`${adminOrigin()}/admin/accounts`);
  await stablePage(page);
  await expect(page.getByRole("heading", { name: "관리자 계정" })).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
