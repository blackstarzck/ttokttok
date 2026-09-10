import { test, expect, ids, authenticate, serviceDb, check } from "./helpers";

test("client: guest navigation, sheets, search and both book types", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "테스트 산책", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "테스트 산책 도서 정보", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("한 문장을 따라");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "댓글", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("로그인하면 댓글");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "테스트 서점 도서 정보 보기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("서점에서 만나보세요");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "탐색", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "오늘의 추천" }),
  ).toBeVisible();
  await page.goto("/discover?q=테스트%20서점");
  await expect(page.getByRole("button", { name: /테스트 서점/ })).toBeVisible();
  await page.goto("/channel/test-walk");
  await expect(
    page.getByRole("heading", { name: "산책하는 문장" }),
  ).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByText("읽은 기록을 남겨보세요")).toBeVisible();
  await page.getByRole("radio", { name: "다크", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("client: authenticated likes, comments, bookmark persist through reload", async ({
  page,
  context,
}) => {
  const userId = await authenticate(context, "user");
  const db = serviceDb();
  check(await db.from("likes").delete().eq("user_id", userId));
  check(await db.from("bookmarks").delete().eq("user_id", userId));
  check(
    await db
      .from("comments")
      .delete()
      .eq("user_id", userId)
      .eq("content", "분리 후에도 저장되는 테스트 댓글"),
  );
  await page.goto("/");
  const card = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: "테스트 산책", exact: true }),
    });
  await card.getByRole("button", { name: "좋아요", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await db
            .from("likes")
            .select("post_id")
            .eq("user_id", userId)
            .eq("post_id", ids.post)
        ).data?.length,
    )
    .toBe(1);
  await page.reload();
  await expect(
    card.getByRole("button", { name: "좋아요", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "댓글", exact: true }).click();
  await page
    .getByRole("textbox", { name: "댓글 입력", exact: true })
    .fill("분리 후에도 저장되는 테스트 댓글");
  await page.getByRole("button", { name: "댓글 등록", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "분리 후에도 저장되는 테스트 댓글",
  );
  await expect
    .poll(
      async () =>
        (
          await db
            .from("comments")
            .select("id")
            .eq("user_id", userId)
            .eq("content", "분리 후에도 저장되는 테스트 댓글")
        ).data?.length,
    )
    .toBe(1);
  await page.keyboard.press("Escape");
  await card
    .getByRole("button", { name: "테스트 산책 도서 정보", exact: true })
    .click();
  await page.getByRole("button", { name: "찜하기", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await db.from("bookmarks").select("book_id").eq("user_id", userId))
          .data?.length,
    )
    .toBe(1);
  await page.goto("/profile");
  await expect(page.getByText("테스트 독자", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /보관/ }).click();
  await expect(page.getByRole("button", { name: /테스트 산책/ })).toBeVisible();
});

test("client: private EPUB loads, settings work and progress reaches DB", async ({
  page,
  context,
}) => {
  const userId = await authenticate(context, "user");
  await page.goto(`/read/${ids.book}`);
  await expect(page.frameLocator("iframe").locator("body")).toContainText(
    "첫 번째 산책",
    { timeout: 30_000 },
  );
  await expect(page.getByText("책을 여는 중…")).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await serviceDb()
            .from("reading_progress")
            .select("epub_cfi")
            .eq("user_id", userId)
            .eq("book_id", ids.book)
        ).data?.[0]?.epub_cfi,
      { timeout: 20_000 },
    )
    .toBeTruthy();
  await page.getByRole("button", { name: /설정/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const response = await page.goto(`/read/${ids.linkBook}`);
  expect(response?.status()).toBe(404);
});

test("client: uploaded video actually plays", async ({ page }) => {
  await page.goto("/reels");
  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  await expect
    .poll(
      () => video.evaluate((element: HTMLVideoElement) => element.currentTime),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
});

test("client: legacy admin address keeps path and query; draft is hidden", async ({
  page,
  request,
}) => {
  const response = await request.get("/admin/posts?from=old", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe(
    "http://localhost:3001/admin/posts?from=old",
  );
  await page.goto("/admin/posts?from=old");
  await expect(page).toHaveURL(/localhost:3001\/admin\/login\?next=/);
  const draft = await request.get(`/p/${ids.draft}`);
  expect(draft.status()).toBe(404);
});
