import { test, expect } from "@playwright/test";
import { authenticate, ids } from "./helpers";
import { snapshot, legacyUrl } from "./visual";

test.use({ baseURL: legacyUrl ?? "http://localhost:3000" });
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: "ttokttok.feed-seed",
      value: "monorepo-visual-baseline",
      domain: "localhost",
      path: "/",
    },
  ]);
});

for (const [name, route] of [
  ["home-375", "/"],
  ["discover-375", "/discover"],
  ["channel-375", "/channel/test-walk"],
  ["post-375", `/p/${ids.post}`],
  ["profile-guest-375", "/profile"],
  ["login-375", "/login"],
  ["about-375", "/about"],
]) {
  test(`@visual client ${name}`, async ({ page }, info) => {
    await page.goto(route);
    await snapshot(page, info, name);
  });
}

test("@visual client home desktop", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await snapshot(page, info, "home-1440");
});

test("@visual client dark theme", async ({ page }, info) => {
  await page.goto("/profile");
  await page.getByRole("radio", { name: "다크", exact: true }).click();
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await snapshot(page, info, "home-dark-375");
});

test("@visual client book sheet", async ({ page }, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "테스트 산책 도서 정보", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await snapshot(page, info, "book-sheet-375");
});

test("@visual client login sheet", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "댓글", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await snapshot(page, info, "login-sheet-375");
});

test("@visual client authenticated profile", async ({
  page,
  context,
}, info) => {
  await authenticate(context, "user");
  await page.goto("/profile");
  await expect(page.getByText("테스트 독자", { exact: true })).toBeVisible();
  await snapshot(page, info, "profile-user-375");
});

test("@visual client reader", async ({ page }, info) => {
  const diagnostics: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") diagnostics.push(msg.text());
  });
  page.on("pageerror", (error) => diagnostics.push(error.message));
  await page.goto(`/read/${ids.book}`);
  await expect(page.frameLocator("iframe").locator("body")).toContainText(
    "첫 번째 산책",
  );
  await snapshot(page, info, "reader-375");
  await info.attach("reader-browser-diagnostics", {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: "application/json",
  });
});
