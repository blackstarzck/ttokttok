import { test, expect, ids, authenticate, serviceDb, check } from "./helpers";
import { PNG } from "pngjs";
import { mkdirSync } from "node:fs";

test("admin: a new image card can be drafted and deleted with its background file", async ({ page, context }) => {
  await authenticate(context, "admin");
  const db = serviceDb();
  let postId: string | undefined;
  let imagePath: string | undefined;
  const hook = `배경 신규 등록 ${Date.now()}`;
  try {
    await page.goto("/admin/posts/new");
    await page.getByLabel("채널 *", { exact: true }).selectOption(ids.channel);
    await page.getByLabel("도서 *", { exact: true }).selectOption(ids.book);
    await page.locator('[name="region-hook-text"]').fill(hook);
    await page.getByRole("radio", { name: "이미지", exact: true }).check();
    const png = new PNG({ width: 40, height: 60 });
    png.data.fill(255);
    await page.getByLabel("배경 이미지", { exact: true }).setInputFiles({ name: "new.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
    await page.getByRole("button", { name: "임시저장", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/posts(?:\?saved=1)?$/);
    const card = check(await db.from("post_cards").select("post_id, background").contains("regions", { hook: { text: hook } }).single()).data;
    postId = card.post_id;
    imagePath = card.background.imageUrl.split("/covers/")[1];
    expect(imagePath).toContain(`post-backgrounds/${postId}/`);
    expect(check(await db.from("posts").select("status").eq("id", postId).single()).data.status).toBe("draft");
    const row = page.getByRole("row").filter({ hasText: postId });
    await row.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await db.storage.from("covers").download(imagePath!)).error).toBeTruthy();
  } finally {
    if (postId) check(await db.from("posts").delete().eq("id", postId));
    if (imagePath) await db.storage.from("covers").remove([imagePath]);
  }
});

test("admin: background upload, text editing, persistence, replacement and removal reach mobile client", async ({ page, context, browser }) => {
  await authenticate(context, "admin");
  const db = serviceDb();
  const original = check(await db.from("post_cards").select("*").eq("post_id", ids.post).single()).data;
  const client = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const files: string[] = [];
  mkdirSync(".tmp/card-background", { recursive: true });
  const png = new PNG({ width: 600, height: 800 });
  for (let y = 0; y < 800; y++) for (let x = 0; x < 600; x++) {
    const i = (y * 600 + x) * 4;
    png.data[i] = 50 + Math.round(x / 6);
    png.data[i + 1] = 85 + Math.round(y / 10);
    png.data[i + 2] = 110;
    png.data[i + 3] = 255;
  }
  async function save() {
    await page.getByRole("button", { name: "발행", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/posts(?:\?saved=1)?$/);
    return check(await db.from("post_cards").select("background").eq("post_id", ids.post).single()).data.background;
  }
  try {
    await page.goto(`/admin/posts/${ids.post}`);
    await page.getByRole("button", { name: "숲", exact: true }).click();
    await page.locator('[name="region-hook-text"]').fill("배경 위에서도 관리자가 정한 문장이 보입니다");
    await page.locator('[name="region-hook-variant"]').selectOption("b");
    const preview = page.locator("[inert] [data-card-body]");
    await expect(preview).toContainText("배경 위에서도 관리자가 정한 문장이 보입니다");
    await expect(preview.locator("img")).toHaveCount(0);
    await expect(preview).not.toContainText("테스트 산책");
    await expect(preview.locator("[data-card-background]")).toHaveCSS("background-color", "rgb(39, 77, 67)");
    let bg = await save();
    expect(bg.color).toBe("#274d43");
    expect(bg.text).toBe("light");
    await client.goto("http://localhost:3000/");
    const article = client.locator("article").filter({ hasText: "배경 위에서도 관리자가 정한 문장이 보입니다" });
    await expect(article).toBeVisible();
    await expect(article.locator("[data-card-background]")).toHaveCSS("background-color", "rgb(39, 77, 67)");
    await expect(article.locator("[data-card-body]")).not.toContainText("테스트 산책");
    await expect(article).toContainText("테스트 산책");
    await article.screenshot({ path: ".tmp/card-background/mobile-solid.png" });

    await page.goto(`/admin/posts/${ids.post}`);
    await page.getByRole("radio", { name: "이미지", exact: true }).check();
    await page.getByLabel("배경 이미지", { exact: true }).setInputFiles({ name: "scene.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
    await page.getByLabel("이미지 가로 위치", { exact: false }).fill("25");
    await page.getByLabel("이미지 세로 위치", { exact: false }).fill("75");
    await page.getByLabel("배경 어둡기", { exact: false }).fill("60");
    await expect(preview.locator("img")).toHaveCSS("object-position", "25% 75%");
    bg = await save();
    expect(bg).toMatchObject({ type: "image", x: 25, y: 75, dim: 60, text: "light" });
    files.push(bg.imageUrl.split("/covers/")[1]);
    expect((await fetch(bg.imageUrl)).status).toBe(200);
    await page.goto(`/admin/posts/${ids.post}`);
    await expect(page.getByLabel("배경 어둡기", { exact: false })).toHaveValue("60");
    await expect(preview.locator("img")).toHaveCSS("object-position", "25% 75%");
    await client.reload();
    await client.waitForLoadState("networkidle");
    await expect(article.locator("[data-card-body] img")).toHaveCSS("object-position", "25% 75%");
    await expect.poll(() => article.locator("[data-card-body] img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(article.locator(".card-background-dim")).toHaveCSS("opacity", "0.6");
    await article.screenshot({ path: ".tmp/card-background/mobile-image.png" });
    await page.locator("aside").screenshot({ path: ".tmp/card-background/admin-preview.png" });

    // 이미지 교체 후에는 이전 파일이 제거되고 새 주소만 남아야 한다.
    await page.getByLabel("배경 이미지", { exact: true }).setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
    bg = await save();
    files.push(bg.imageUrl.split("/covers/")[1]);
    expect(files[0]).not.toBe(files[1]);
    expect((await db.storage.from("covers").download(files[0])).error).toBeTruthy();

    await page.goto(`/admin/posts/${ids.post}`);
    await page.getByRole("button", { name: "이미지 제거" }).click();
    await page.getByRole("radio", { name: "단색", exact: true }).check();
    await page.getByRole("button", { name: "종이", exact: true }).click();
    bg = await save();
    expect(bg).toMatchObject({ type: "solid", imageUrl: null, text: "dark" });
    expect((await db.storage.from("covers").download(files[1])).error).toBeTruthy();

    // 배경은 테마와 독립적이며 긴 문구도 작은 화면 밖으로 넘치지 않는다.
    await page.goto(`/admin/posts/${ids.post}`);
    await page.locator('[name="region-hook-text"]').fill("긴 문장을 작은 화면에서도 읽을 수 있습니다. ".repeat(3).slice(0, 60));
    await page.locator('[name="region-desc-text"]').fill("설명도 잘리지 않고 아래로 이어집니다. ".repeat(6).slice(0, 90));
    await save();
    for (const width of [320, 375, 480]) {
      await client.setViewportSize({ width, height: 812 });
      await client.goto("http://localhost:3000/");
      await expect(client.getByText(/긴 문장을 작은 화면에서도/).first()).toBeVisible();
      expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await client.goto(`http://localhost:3000/p/${ids.post}`);
    const surface = client.locator("[data-card-background]");
    await expect(surface).toBeVisible();
    expect((await surface.boundingBox())!.height).toBeGreaterThan(600);
    await client.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(surface).toHaveCSS("background-color", "rgb(239, 233, 223)");
    await expect(surface).toHaveCSS("color", "rgb(34, 34, 34)");
  } finally {
    check(await db.from("post_cards").upsert(original));
    if (files.length) await db.storage.from("covers").remove(files);
    await client.close();
  }
});
