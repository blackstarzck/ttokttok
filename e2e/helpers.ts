import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  account,
  dbUrl,
  ids,
  serviceDb,
  check,
  clientOrigin,
  adminOrigin,
} from "../tests/live-db/fixtures";

export { expect, ids, serviceDb, check, clientOrigin, adminOrigin };
// Reproduced in the preserved app with Chromium 153. EPUB intentionally forbids
// scripts; do not weaken its sandbox to silence this browser diagnostic.
const epubSandboxDiagnostic =
  "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";
export const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (
          response.status() >= 500 ||
          (response.status() >= 400 &&
            ["script", "stylesheet", "image", "font", "fetch", "xhr"].includes(
              response.request().resourceType(),
            ))
        ) {
          errors.push(
            `HTTP ${response.status()}: ${new URL(response.url()).pathname}`,
          );
        }
      });
      page.on("console", (msg) => {
        if (msg.type() !== "error") return;
        if (msg.text() === epubSandboxDiagnostic && /\/read\//.test(page.url()))
          return;
        if (/Failed to load resource:.*(?:404|400|403)/.test(msg.text()))
          return;
        errors.push(msg.text());
      });
      await use(errors);
      expect(errors, "Browser runtime errors").toEqual([]);
    },
    { auto: true },
  ],
});

export async function authenticate(
  context: BrowserContext,
  role: "admin" | "user",
  app: "admin" | "client" = role === "admin" ? "admin" : "client",
) {
  const { session } = await account(role);
  const cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    sameSite: "Lax";
  }[] = [];
  const db = createServerClient(
    dbUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(app === "admin"
        ? { cookieOptions: { name: "ttokttok-admin-auth" } }
        : {}),
      cookies: {
        getAll: () => [],
        setAll: (values) =>
          cookies.push(
            ...values.map(({ name, value }) => ({
              name,
              value,
              domain: "localhost",
              path: "/",
              sameSite: "Lax" as const,
            })),
          ),
      },
    },
  );
  const { error } = await db.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
  await context.addCookies(cookies);
  return session.user.id;
}

export async function adminLogin(page: Page) {
  await page.goto(`${adminOrigin()}/admin/login`);
  await page
    .getByLabel("아이디", { exact: true })
    .fill(process.env.TEST_ADMIN_ID!);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(process.env.TEST_PASSWORD!);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export async function stablePage(page: Page) {
  await page.waitForLoadState("load");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.locator("body")).not.toBeEmpty();
}
