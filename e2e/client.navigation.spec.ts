import { test, expect } from "./helpers";

test("client: bottom tabs switch before slow content arrives", async ({ page }, info) => {
  const prefetched = new Set<string>();
  page.on("response", (response) => {
    const headers = response.request().headers();
    // The route-tree response only describes the route. Wait for the separate
    // shell response that actually includes its loading boundary.
    if (
      headers["next-router-prefetch"] === "1" &&
      headers["next-router-state-tree"] &&
      !decodeURIComponent(headers["next-router-state-tree"]).includes("metadata-only")
    ) {
      prefetched.add(new URL(response.url()).pathname);
    }
  });

  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: "오늘의 추천" })).toBeVisible();

  const tabs = [
    { href: "/reels", name: "릴스" },
    { href: "/profile", name: "프로필" },
    { href: "/", name: "홈" },
    { href: "/discover", name: "탐색" },
  ];

  for (const { href, name } of tabs) {
    await expect.poll(() => prefetched.has(href)).toBe(true);

    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route((url) => url.pathname === href && url.searchParams.has("_rsc"), async (route) => {
      if (route.request().headers()["next-router-prefetch"] !== "1") {
        await pending;
      }
      await route.continue();
    });

    try {
      const tab = page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name, exact: true });
      await tab.click();
      // The response is still held: a pass proves the old page no longer blocks navigation.
      await expect(tab).toHaveAttribute("aria-current", "page", { timeout: 1500 });
      await expect(page.getByRole("status", { name: `${name} 불러오는 중` })).toBeVisible({ timeout: 1500 });
      await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeVisible();
      await info.attach(`${name} loading at 375px`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      if (href === "/reels") {
        // A second tab remains usable even while the first tab's response is held.
        await page.getByRole("link", { name: "탐색", exact: true }).click();
        await expect(page.getByRole("searchbox", { name: "검색어" })).toBeVisible();
        await expect(page).toHaveURL(/\/discover$/);
      }
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
    await expect(page.getByRole("status", { name: `${name} 불러오는 중` })).toBeHidden();
  }
});
