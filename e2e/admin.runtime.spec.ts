import {
  test,
  expect,
  ids,
  authenticate,
  adminLogin,
  serviceDb,
  check,
} from "./helpers";
import { originalHook } from "../tests/live-db/fixtures";

test("admin: password login, every management page and logout", async ({
  page,
}) => {
  await adminLogin(page);
  for (const [route, heading] of [
    ["books", "도서"],
    ["posts", "게시물"],
    ["channels", "채널"],
    ["featured", "오늘의 추천"],
    ["reports", "신고"],
    ["books/new", "새 도서"],
    ["books/import", "가져오기"],
    ["books/wikisource", "위키문헌"],
  ]) {
    await page.goto(`/admin/${route}`);
    await expect(page.locator("main h1")).toContainText(heading);
  }
  await expect(page.getByRole("link", { name: "서비스 보기" })).toHaveAttribute(
    "href",
    "http://localhost:3000",
  );
  await page.goto("/admin/posts");
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: ids.draft })
      .getByRole("link", { name: "보기", exact: true }),
  ).toHaveAttribute("href", `/admin/posts/${ids.draft}`);
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("row")
    .filter({ hasText: ids.post })
    .getByRole("link", { name: "보기", exact: true })
    .click();
  const client = await opened;
  await expect(client).toHaveURL(`http://localhost:3000/p/${ids.post}`);
  await expect(client.getByText(originalHook, { exact: true })).toBeVisible();
  await client.close();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin/posts");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("admin: reader is rejected without redirect loop", async ({
  page,
  context,
}) => {
  await authenticate(context, "user", "admin");
  await page.goto("/admin/posts");
  await expect(page).toHaveURL(/\/admin\/login\?error=forbidden/);
  await expect(
    page.getByText(/이 계정에는 관리자 권한이 없습니다/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
});

test("admin: login and logout preserve the separate client session", async ({
  page,
  context,
}) => {
  await authenticate(context, "user");
  await adminLogin(page);
  const names = (await context.cookies()).map((cookie) => cookie.name);
  expect(names.some((name) => name.startsWith("ttokttok-admin-auth"))).toBe(
    true,
  );
  expect(names.some((name) => name.startsWith("sb-"))).toBe(true);
  await page.goto("http://localhost:3000/profile");
  await expect(page.getByText("테스트 독자", { exact: true })).toBeVisible();
  await page.goto("http://localhost:3001/admin");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.goto("http://localhost:3000/profile");
  await expect(page.getByText("테스트 독자", { exact: true })).toBeVisible();
});

test("admin: edit preview, publish and confirm updated client content", async ({
  page,
  context,
  browser,
}) => {
  await authenticate(context, "admin");
  await page.goto(`/admin/posts/${ids.post}`);
  const hook = "관리자에서 바꾼 문장이 사용자에게 보입니다";
  await page.locator('[name="region-hook-text"]').fill(hook);
  await expect(page.locator("[inert]")).toContainText(hook);
  await page.getByRole("button", { name: "발행", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/posts(?:\?saved=1)?$/);
  const db = serviceDb();
  expect(
    check(
      await db
        .from("post_cards")
        .select("regions")
        .eq("post_id", ids.post)
        .single(),
    ).data.regions.hook.text,
  ).toBe(hook);
  const client = await browser.newPage({
    viewport: { width: 375, height: 812 },
  });
  try {
    await client.goto("http://localhost:3000/");
    await expect(client.getByText(hook, { exact: true })).toBeVisible();
    await page.goto(`/admin/posts/${ids.post}`);
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/posts(?:\?saved=1)?$/);
    await expect
      .poll(
        async () =>
          check(
            await db.from("posts").select("status").eq("id", ids.post).single(),
          ).data.status,
      )
      .toBe("draft");
    await client.reload();
    await expect(client.getByText(hook, { exact: true })).toHaveCount(0);
  } finally {
    await client.close();
    await page.goto(`/admin/posts/${ids.post}`);
    await page.locator('[name="region-hook-text"]').fill(originalHook);
    await page.getByRole("button", { name: "발행", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/posts(?:\?saved=1)?$/);
  }
});

test("admin: channel create, edit and delete reach the real DB", async ({
  page,
  context,
}) => {
  check(
    await serviceDb()
      .from("channels")
      .delete()
      .eq("slug", "integration-test-channel"),
  );
  await authenticate(context, "admin");
  await page.goto("/admin/channels");
  await page.getByLabel("이름 *", { exact: true }).fill("통합 테스트 채널");
  await page
    .getByLabel("슬러그 *", { exact: true })
    .fill("integration-test-channel");
  await page.getByLabel("장르 *", { exact: true }).fill("소설");
  await page
    .getByLabel("커버 이미지 URL", { exact: true })
    .fill("https://example.com/covers/integration.png");
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByText("저장했습니다.", { exact: true })).toBeVisible();
  const row = page
    .getByRole("row")
    .filter({ hasText: "integration-test-channel" });
  await expect(row).toContainText("통합 테스트 채널");
  const db = serviceDb();
  const channel = check(
    await db
      .from("channels")
      .select("id, cover_url")
      .eq("slug", "integration-test-channel")
      .single(),
  ).data;
  expect(channel.cover_url).toBe("https://example.com/covers/integration.png");
  try {
    await row.getByRole("link", { name: "수정" }).click();
    await page.getByLabel("이름 *", { exact: true }).fill("수정된 테스트 채널");
    await page.getByRole("button", { name: "수정", exact: true }).click();
    await expect(row).toContainText("수정된 테스트 채널");
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    expect(
      check(await db.from("channels").select("id").eq("id", channel.id)).data,
    ).toHaveLength(0);
  } finally {
    check(await db.from("channels").delete().eq("id", channel.id));
  }
});
