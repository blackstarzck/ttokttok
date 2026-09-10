import { test, expect } from "@playwright/test";
import { authenticate, ids } from "./helpers";
import { snapshot, legacyUrl, capturingLegacy } from "./visual";

test.use({ baseURL: legacyUrl ?? "http://localhost:3001" });

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
