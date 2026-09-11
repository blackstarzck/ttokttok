import { test, expect } from "@playwright/test";
import { authenticate, ids, adminOrigin } from "./helpers";
import { snapshot, legacyUrl, capturingLegacy } from "./visual";

// legacyUrl(3100)은 분리 전 앱을 찍을 때만 쓰는 별개의 기준선이다 — 그 외에는
// 실제 admin 테스트 서버 주소(ADMIN_URL)를 따른다.
test.use({ baseURL: legacyUrl ?? adminOrigin() });

test("@visual admin login", async ({ page }, info) => {
  await page.goto("/admin/login");
  await snapshot(page, info, "login-1440");
});

for (const [name, route] of [
  ["dashboard", ""],
  ["books", "books"],
  ["book-new", "books/new"],
  ["book-edit", `books/${ids.book}`],
  ["posts", "posts"],
  ["channels", "channels"],
  ["featured", "featured"],
  ["reports", "reports"],
]) {
  test(`@visual admin ${name}`, async ({ page, context }, info) => {
    await authenticate(context, "admin", capturingLegacy ? "client" : "admin");
    await page.goto(`/admin/${route}`);
    await expect(page.locator("main h1")).toBeVisible();
    await snapshot(page, info, `${name}-1440`);
  });
}

for (const template of ["a", "b"]) {
  test(`@visual admin card editor ${template}`, async ({
    page,
    context,
  }, info) => {
    await authenticate(context, "admin", capturingLegacy ? "client" : "admin");
    await page.goto(`/admin/posts/${ids.post}`);
    await page.locator('[name="template"]').selectOption(template);
    await expect(page.locator("[inert]")).toContainText(
      "한 문장이 하루를 바꿀 때",
    );
    await snapshot(page, info, `editor-${template}-1440`);
  });
}
