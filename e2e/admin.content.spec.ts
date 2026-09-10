import { test, expect, ids, authenticate, serviceDb, check } from "./helpers";
import { fixtureEpub, account } from "../tests/live-db/fixtures";
import { PNG } from "pngjs";

test("admin: EPUB and cover upload can be read by client, then deleted", async ({
  page,
  context,
  browser,
}) => {
  await authenticate(context, "admin");
  await page.goto("/admin/books/new");
  await page.getByLabel("제목 *", { exact: true }).fill("업로드 검증 도서");
  await page.getByLabel("저자 *", { exact: true }).fill("테스트 작가");
  await page.getByLabel("카테고리 *", { exact: true }).fill("소설");
  await page
    .getByLabel("EPUB 파일", { exact: true })
    .setInputFiles({
      name: "test.epub",
      mimeType: "application/epub+zip",
      buffer: Buffer.from(fixtureEpub()),
    });
  const cover = new PNG({ width: 80, height: 120 });
  cover.data.fill(190);
  await page
    .getByLabel("표지 이미지", { exact: true })
    .setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(cover),
    });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "업로드 검증 도서" });
  await expect(row).toBeVisible();
  const db = serviceDb();
  const book = check(
    await db
      .from("books")
      .select("id,epub_path,cover_url")
      .eq("title", "업로드 검증 도서")
      .single(),
  ).data;
  const client = await browser.newPage({
    viewport: { width: 375, height: 812 },
  });
  try {
    expect((await fetch(book.cover_url)).status).toBe(200);
    await client.goto(`http://localhost:3000/read/${book.id}`);
    await expect(client.frameLocator("iframe").locator("body")).toContainText(
      "첫 번째 산책",
    );
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    expect(
      check(await db.from("books").select("id").eq("id", book.id)).data,
    ).toHaveLength(0);
    expect(
      (await db.storage.from("epubs").download(book.epub_path)).error,
    ).toBeTruthy();
  } finally {
    await client.close();
    check(await db.from("books").delete().eq("id", book.id));
    await db.storage.from("epubs").remove([book.epub_path]);
    await db.storage.from("covers").remove([`${book.id}.png`]);
  }
});

test("admin: featured visibility updates the independent client", async ({
  page,
  context,
  browser,
}) => {
  await authenticate(context, "admin");
  await page.goto("/admin/featured");
  const row = page.locator("li").filter({ hasText: "테스트 산책" });
  const client = await browser.newPage();
  try {
    await row.getByRole("button", { name: "내리기", exact: true }).click();
    await expect(
      row.getByRole("button", { name: "올리기", exact: true }),
    ).toBeVisible();
    await client.goto("http://localhost:3000/discover");
    await expect(
      client.getByRole("heading", { name: "오늘의 추천", exact: true }),
    ).toHaveCount(0);
    await row.getByRole("button", { name: "올리기", exact: true }).click();
    await expect(
      row.getByRole("button", { name: "내리기", exact: true }),
    ).toBeVisible();
    await client.reload();
    await expect(
      client.getByRole("heading", { name: "오늘의 추천", exact: true }),
    ).toBeVisible();
  } finally {
    await client.close();
    check(
      await serviceDb()
        .from("featured_books")
        .update({ active: true })
        .eq("book_id", ids.book),
    );
  }
});

test("admin: reported comment is moderated in the real database", async ({
  page,
  context,
}) => {
  const reader = await account("user");
  const comment = check(
    await reader.db
      .from("comments")
      .insert({ post_id: ids.post, content: "신고 처리 검증 댓글" })
      .select("id")
      .single(),
  ).data;
  check(
    await reader.db
      .from("reports")
      .insert({
        comment_id: comment.id,
        reporter_id: reader.user.id,
        reason: "etc",
      }),
  );
  await authenticate(context, "admin");
  try {
    await page.goto("/admin/reports");
    const row = page.locator("li").filter({ hasText: "신고 처리 검증 댓글" });
    await row.getByRole("button", { name: "댓글 삭제", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    expect(
      check(
        await serviceDb()
          .from("comments")
          .select("deleted_at")
          .eq("id", comment.id)
          .single(),
      ).data.deleted_at,
    ).toBeTruthy();
    expect(
      check(
        await serviceDb()
          .from("reports")
          .select("status")
          .eq("comment_id", comment.id)
          .single(),
      ).data.status,
    ).toBe("deleted");
  } finally {
    check(await serviceDb().from("comments").delete().eq("id", comment.id));
  }
});
