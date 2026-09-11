import { test, expect, authenticate, serviceDb, check } from "./helpers";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

test("admin: generate, save, reopen and replace a 3D book cover", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await authenticate(context, "admin");
  const title = `입체 표지 검증 ${Date.now()}`;
  const db = serviceDb();
  let bookId: string | undefined;
  const paths: string[] = [];
  try {
    await page.goto("/admin/books/new");
    await page.getByLabel("제목 *", { exact: true }).fill(title);
    await page.getByLabel("저자 *", { exact: true }).fill("현진건");
    await page.getByLabel("카테고리 *", { exact: true }).fill("소설");
    await page.getByLabel("ISBN", { exact: true }).fill("9788936434267");
    await page
      .getByRole("button", { name: "3D 표지 만들기", exact: true })
      .click();
    const editor = page.getByRole("region", { name: "3D 표지 편집기" });
    await expect(
      page.getByRole("button", { name: "이미지로 적용", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "모던", exact: false }).click();
    await page.getByRole("button", { name: "밤", exact: true }).click();
    await page.getByLabel("책 각도").fill("-30");
    await page.getByLabel("위아래 기울기").fill("23");
    await page.getByLabel("책 두께").fill("40");
    mkdirSync(".tmp/cover-verification", { recursive: true });
    await editor.screenshot({ path: ".tmp/cover-verification/desktop.png" });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(editor).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await editor.screenshot({ path: ".tmp/cover-verification/mobile.png" });
    // Saving an unapplied draft must not silently discard the editor.
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(
      "이미지로 적용하거나",
    );
    await page
      .getByRole("button", { name: "이미지로 적용", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    // Changing metadata after applying an image requires regenerating it.
    await page.getByLabel("제목 *", { exact: true }).fill(`${title} 수정`);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.locator("p[role=alert]")).toContainText(
      "제목이나 저자가 바뀌었습니다",
    );
    await page.getByLabel("제목 *", { exact: true }).fill(title);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1|\/admin\/books$/);
    const book = check(
      await db
        .from("books")
        .select("id,cover_url,cover_design")
        .eq("title", title)
        .single(),
    ).data;
    bookId = book.id;
    paths.push(book.cover_url.split("/covers/")[1]);
    expect(book.cover_design).toMatchObject({
      template: "modern",
      palette: "navy",
      angle: -30,
      tilt: 23,
      thickness: 40,
      title,
      author: "현진건",
    });
    const response = await fetch(book.cover_url);
    expect(response.status).toBe(200);
    const imageBytes = Buffer.from(await response.arrayBuffer());
    writeFileSync(".tmp/cover-verification/generated.png", imageBytes);
    const png = PNG.sync.read(imageBytes);
    expect([png.width, png.height]).toEqual([800, 1200]);
    // Transparent corners + substantial opaque content rule out a blank WebGL export.
    expect(png.data[3]).toBe(0);
    let opaque = 0;
    for (let i = 3; i < png.data.length; i += 4)
      if (png.data[i] > 200) opaque++;
    expect(opaque).toBeGreaterThan(100_000);
    for (let y = 0; y < png.height; y++) {
      expect(png.data[y * png.width * 4 + 3]).toBe(0);
      expect(png.data[(y * png.width + png.width - 1) * 4 + 3]).toBe(0);
    }
    await page.goto(`/admin/books/${bookId}`);
    await page.getByRole("button", { name: "3D 표지 다시 편집" }).click();
    await expect(page.getByLabel("책 각도")).toHaveValue("-30");
    await expect(page.getByLabel("위아래 기울기")).toHaveValue("23");
    await expect(page.getByLabel("책 두께")).toHaveValue("40");
    await expect(
      page.getByRole("button", { name: "밤", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "문학", exact: false }).click();
    await page.getByLabel("책 각도").fill("150");
    await page.getByLabel("위아래 기울기").fill("-12");
    await page
      .getByRole("button", { name: "이미지로 적용", exact: true })
      .click();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1|\/admin\/books$/);
    const edited = check(
      await db
        .from("books")
        .select("cover_url,cover_design")
        .eq("id", bookId)
        .single(),
    ).data;
    expect(edited.cover_url).not.toBe(book.cover_url);
    expect(
      (await db.storage.from("covers").download(paths[0])).error,
    ).toBeTruthy();
    expect(edited.cover_design).toMatchObject({
      template: "literary",
      angle: 150,
      tilt: -12,
    });
    paths.push(edited.cover_url.split("/covers/")[1]);
    // A direct upload clears the generator metadata, while ordinary text edits preserve it.
    await page.goto(`/admin/books/${bookId}`);
    await page.getByRole("button", { name: "3D 표지 다시 편집" }).click();
    await expect(page.getByLabel("책 각도")).toHaveValue("150");
    await expect(page.getByLabel("위아래 기울기")).toHaveValue("-12");
    await page.getByRole("button", { name: "편집 취소" }).click();
    await page
      .getByLabel("소개", { exact: true })
      .fill("표지 설정을 유지하는 소개 수정");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1|\/admin\/books$/);
    expect(
      check(
        await db.from("books").select("cover_design").eq("id", bookId).single(),
      ).data.cover_design,
    ).toEqual(edited.cover_design);
    await page.goto(`/admin/books/${bookId}`);
    const upload = new PNG({ width: 80, height: 120 });
    upload.data.fill(190);
    await page.getByLabel("표지 이미지", { exact: true }).setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(upload),
    });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1|\/admin\/books$/);
    const replaced = check(
      await db
        .from("books")
        .select("cover_design,cover_url")
        .eq("id", bookId)
        .single(),
    ).data;
    expect(replaced.cover_design).toBeNull();
    paths.push(replaced.cover_url.split("/covers/")[1]);
  } finally {
    if (bookId) check(await db.from("books").delete().eq("id", bookId));
    if (paths.length) await db.storage.from("covers").remove(paths);
  }
});

test("admin: cancelling the generator preserves the existing cover", async ({
  page,
  context,
}) => {
  await authenticate(context, "admin");
  await page.goto("/admin/books/new");
  await page.getByRole("button", { name: "3D 표지 만들기" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("먼저 제목");
  await page.getByLabel("제목 *", { exact: true }).fill("가".repeat(120));
  await page.getByLabel("저자 *", { exact: true }).fill("나".repeat(80));
  const oldCover = new PNG({ width: 80, height: 120 });
  oldCover.data.fill(190);
  await page.getByLabel("표지 이미지", { exact: true }).setInputFiles({
    name: "original.png",
    mimeType: "image/png",
    buffer: PNG.sync.write(oldCover),
  });
  await page.getByRole("button", { name: "3D 표지 만들기" }).click();
  await expect(
    page.getByRole("button", { name: "이미지로 적용", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "편집 취소" }).click();
  await expect(page.locator('input[name="cover_design"]')).toHaveValue("");
  expect(
    await page
      .getByLabel("표지 이미지", { exact: true })
      .evaluate((element: HTMLInputElement) => element.files?.[0]?.name),
  ).toBe("original.png");
});

test("admin: unavailable graphics shows an actionable fallback", async ({
  page,
  context,
}) => {
  await authenticate(context, "admin");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/admin/books/new");
  await page.getByLabel("제목 *", { exact: true }).fill("운수 좋은 날");
  await page.getByLabel("저자 *", { exact: true }).fill("현진건");
  await page.getByRole("button", { name: "3D 표지 만들기" }).click();
  await expect(page.locator("p[role=alert]")).toContainText(
    "3D 미리보기를 시작하지 못했습니다",
  );
  await expect(
    page.getByRole("button", { name: "이미지로 적용", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "편집 취소" }).click();
  await expect(page.getByLabel("표지 이미지", { exact: true })).toBeEnabled();
});

test("admin: rotate every face with mouse, keyboard and touch and export unclipped views", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await authenticate(context, "admin");
  await page.goto("/admin/books/new");
  await page.getByLabel("제목 *", { exact: true }).fill("운수 좋은 날");
  await page.getByLabel("저자 *", { exact: true }).fill("현진건");
  await page.getByRole("button", { name: "3D 표지 만들기" }).click();
  const apply = page.getByRole("button", {
    name: "이미지로 적용",
    exact: true,
  });
  const preview = page.getByLabel("운수 좋은 날 3D 표지 미리보기", {
    exact: true,
  });
  const angle = page.getByLabel("책 각도");
  const tilt = page.getByLabel("위아래 기울기");
  await expect(apply).toBeEnabled();
  await preview.scrollIntoViewIfNeeded();
  let box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, {
    steps: 12,
  });
  await page.mouse.up();
  expect(Math.abs(Number(await angle.inputValue()))).toBeGreaterThan(100);
  expect(Number(await tilt.inputValue())).toBeGreaterThan(8);
  await preview.focus();
  await page.keyboard.press("Home");
  await expect(angle).toHaveValue("0");
  await expect(tilt).toHaveValue("0");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(angle).toHaveValue("15");
  await page.setViewportSize({ width: 375, height: 812 });
  await preview.scrollIntoViewIfNeeded();
  box = (await preview.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const start = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.5 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: start.x + box.width * 0.3, y: start.y - 30 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => Number(await angle.inputValue()))
    .toBeGreaterThan(100);
  await cdp.detach();
  mkdirSync(".tmp/cover-verification", { recursive: true });
  const views = [
    { face: "앞표지", angle: 0, tilt: 0, thickness: 27 },
    { face: "책등", angle: 90, tilt: 0, thickness: 10 },
    { face: "뒷표지", angle: 180, tilt: 0, thickness: 50 },
    { face: "종이 면", angle: -90, tilt: 0, thickness: 50 },
    { face: "위쪽", angle: 90, tilt: 90, thickness: 50 },
    { face: "아래쪽", angle: -90, tilt: -90, thickness: 10 },
  ];
  for (const [index, view] of views.entries()) {
    if (index < 4) {
      await page.getByRole("button", { name: view.face, exact: true }).click();
      await expect(angle).toHaveValue(String(view.angle));
    } else await angle.fill(String(view.angle));
    await tilt.fill(String(view.tilt));
    await page.getByLabel("책 두께").fill(String(view.thickness));
    await apply.click();
    // PNG encoding finishes asynchronously; wait for the new file to be applied.
    await expect(
      page.getByRole("region", { name: "3D 표지 편집기" }),
    ).toHaveCount(0);
    const bytes = await page
      .getByLabel("표지 이미지", { exact: true })
      .evaluate(async (input: HTMLInputElement) => {
        return Array.from(new Uint8Array(await input.files![0].arrayBuffer()));
      });
    const buffer = Buffer.from(bytes);
    expect(buffer.length).toBeLessThan(2 * 1024 * 1024);
    writeFileSync(`.tmp/cover-verification/face-${index}.png`, buffer);
    const png = PNG.sync.read(buffer);
    let opaque = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const alpha = png.data[(y * png.width + x) * 4 + 3];
        if (alpha > 200) opaque++;
        if (x === 0 || y === 0 || x === png.width - 1 || y === png.height - 1)
          expect(alpha).toBe(0);
      }
    }
    expect(opaque).toBeGreaterThan(1_000);
    if (view.face === "앞표지" || view.face === "뒷표지")
      expect(opaque).toBeGreaterThan(100_000);
    const settings = JSON.parse(
      await page.locator('input[name="cover_design"]').inputValue(),
    );
    expect(settings).toMatchObject({
      angle: view.angle,
      tilt: view.tilt,
      thickness: view.thickness,
    });
    await page.getByRole("button", { name: "3D 표지 다시 편집" }).click();
    await expect(apply).toBeEnabled();
    await expect(angle).toHaveValue(String(view.angle));
    await expect(tilt).toHaveValue(String(view.tilt));
  }
  await page.getByRole("button", { name: "편집 취소" }).click();
});
