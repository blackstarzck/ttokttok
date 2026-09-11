import { test, expect, authenticate, serviceDb, check } from "./helpers";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

/** 바깥 테두리는 `edge`, 안쪽은 `center` — 파생 색이 테두리에서 오는지 가른다. */
function framed(
  width: number,
  height: number,
  edge: [number, number, number],
  center: [number, number, number],
  border: number,
) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inner =
        x >= border && x < width - border && y >= border && y < height - border;
      const [r, g, b] = inner ? center : edge;
      png.data.set([r, g, b, 255], (y * width + x) * 4);
    }
  return PNG.sync.write(png);
}

function opaqueMean(buffer: Buffer) {
  const png = PNG.sync.read(buffer);
  const sum = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < 200) continue;
    sum[0] += png.data[i];
    sum[1] += png.data[i + 1];
    sum[2] += png.data[i + 2];
    count++;
  }
  return { mean: sum.map((v) => v / count), count, png };
}

async function swatchColor(
  list: import("@playwright/test").Locator,
  index: number,
) {
  const value = await list
    .getByRole("listitem")
    .nth(index)
    .locator("span")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  return value.match(/\d+/g)!.map(Number);
}

async function appliedCover(page: import("@playwright/test").Page) {
  return Buffer.from(
    await page
      .getByLabel("표지 이미지", { exact: true })
      .evaluate(async (input: HTMLInputElement) =>
        Array.from(new Uint8Array(await input.files![0].arrayBuffer())),
      ),
  );
}

test("admin: image template uploads faces, derives board colour, re-edits without re-upload and cleans files", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await authenticate(context, "admin");
  const title = `이미지 표지 검증 ${Date.now()}`;
  const db = serviceDb();
  let bookId: string | undefined;
  const paths = new Set<string>();
  const pathOf = (url: string) => url.split("/covers/")[1];
  // 앞표지: 진한 붉은 테두리 + 밝은 중앙. 그림면 비율(0.583)로 중앙을 자르면 좌우 37.5px이
  // 사라지고, 남은 테두리 안에서 바깥 8%(≈42px)를 평균하므로 테두리는 그보다 넓어야 한다.
  const front = framed(600, 900, [140, 28, 44], [235, 225, 210], 100);
  const spine = framed(60, 900, [30, 60, 120], [30, 60, 120], 0);
  const back = framed(600, 900, [90, 90, 90], [200, 200, 200], 40);
  const imageTemplate = page.getByRole("button", {
    name: "면별로 올립니다",
    exact: false,
  });
  const editor = page.getByRole("region", { name: "3D 표지 편집기" });
  const apply = page.getByRole("button", { name: "이미지로 적용", exact: true });
  const saved = /\/admin\/books\?saved=1|\/admin\/books$/;
  try {
    await page.goto("/admin/books/new");
    await page.getByLabel("제목 *", { exact: true }).fill(title);
    await page.getByLabel("저자 *", { exact: true }).fill("현진건");
    await page.getByLabel("카테고리 *", { exact: true }).fill("소설");
    await page.getByLabel("ISBN", { exact: true }).fill("9788936434267");
    await page.getByRole("button", { name: "3D 표지 만들기", exact: true }).click();
    await expect(apply).toBeEnabled();
    await imageTemplate.click();
    // 앞표지가 없으면 적용할 수 없고, 팔레트 선택은 사라진다.
    await expect(apply).toBeDisabled();
    await expect(page.getByRole("button", { name: "숲", exact: true })).toHaveCount(0);
    await expect(editor.getByText("앞표지 이미지를 올려 주세요.")).toBeVisible();
    await page.getByLabel("앞표지 이미지 (필수)", { exact: true }).setInputFiles({
      name: "front.png",
      mimeType: "image/png",
      buffer: front,
    });
    await expect(apply).toBeEnabled();
    const swatches = editor.getByRole("list", { name: "이미지에서 뽑은 색" });
    await expect(swatches.getByRole("listitem")).toHaveCount(3);
    // 판 색 = 보이는 크롭의 테두리 평균. 축소 필터링 오차만 허용한다.
    await expect
      .poll(async () => {
        const board = await swatchColor(swatches, 0);
        return [140, 28, 44].every(
          (target, channel) => Math.abs(board[channel] - target) <= 2,
        );
      })
      .toBe(true);
    // 어두운 판 위에는 밝은 잉크 토큰.
    await expect(swatches.getByRole("listitem").nth(1).locator("span")).toHaveCSS(
      "background-color",
      "rgb(246, 241, 231)",
    );
    await page.getByLabel("책등 이미지", { exact: true }).setInputFiles({
      name: "spine.png",
      mimeType: "image/png",
      buffer: spine,
    });
    await expect(editor.getByText("적용됨")).toHaveCount(2);
    await expect(editor.getByText("비우면 제목·저자로 그립니다.")).toHaveCount(1);
    mkdirSync(".tmp/cover-verification", { recursive: true });

    // 뒷표지는 올리지 않았다 — 파생된 붉은 판 색으로 제목·저자를 그려야 한다.
    await page.getByRole("button", { name: "뒷표지", exact: true }).click();
    await apply.click();
    await expect(editor).toHaveCount(0);
    const backBytes = await appliedCover(page);
    writeFileSync(".tmp/cover-verification/image-back-derived.png", backBytes);
    const derived = opaqueMean(backBytes);
    expect(derived.count).toBeGreaterThan(100_000);
    // 팔레트 숲(녹색)이었다면 G가 앞선다.
    expect(derived.mean[0]).toBeGreaterThan(derived.mean[1] + 40);
    expect(derived.mean[0]).toBeGreaterThan(derived.mean[2] + 40);
    const draft = JSON.parse(
      await page.locator('input[name="cover_design"]').inputValue(),
    );
    expect(draft.template).toBe("image");
    expect(draft.images.front).toMatch(/^blob:/);
    expect(draft.images.spine).toMatch(/^blob:/);
    expect(draft.images.back).toBeUndefined();

    // 다시 열면 두 면이 그대로 있다. 뒷표지를 더하고 각도를 정한다.
    await page.getByRole("button", { name: "3D 표지 다시 편집" }).click();
    await expect(imageTemplate).toHaveAttribute("aria-pressed", "true");
    await expect(editor.getByText("적용됨")).toHaveCount(2);
    await page.getByLabel("뒷표지 이미지", { exact: true }).setInputFiles({
      name: "back.png",
      mimeType: "image/png",
      buffer: back,
    });
    await expect(editor.getByText("적용됨")).toHaveCount(3);
    await expect(editor.locator("img")).toHaveCount(3);
    await page.getByLabel("책 각도").fill("35");
    await page.getByLabel("위아래 기울기").fill("10");
    await page.getByLabel("책 두께").fill("30");
    await editor.screenshot({ path: ".tmp/cover-verification/image-desktop.png" });
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(editor).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await editor.screenshot({ path: ".tmp/cover-verification/image-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await apply.click();
    await expect(editor).toHaveCount(0);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(saved);
    const book = check(
      await db.from("books").select("id,cover_url,cover_design").eq("title", title).single(),
    ).data;
    bookId = book.id;
    paths.add(pathOf(book.cover_url));
    expect(book.cover_design).toMatchObject({
      template: "image",
      angle: 35,
      tilt: 10,
      thickness: 30,
      title,
    });
    for (const face of ["front", "spine", "back"] as const) {
      const url: string = book.cover_design.images[face];
      expect(pathOf(url)).toMatch(new RegExp(`^${bookId}/design-${face}-[0-9a-f-]+\\.webp$`));
      paths.add(pathOf(url));
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
    }
    const frontBytes = Buffer.from(await (await fetch(book.cover_url)).arrayBuffer());
    writeFileSync(".tmp/cover-verification/image-front.png", frontBytes);
    const rendered = opaqueMean(frontBytes);
    expect([rendered.png.width, rendered.png.height]).toEqual([800, 1200]);
    expect(rendered.count).toBeGreaterThan(100_000);

    // 저장된 주소로 다시 열어 각도만 바꾸면 면 파일은 그대로 남는다.
    await page.goto(`/admin/books/${bookId}`);
    await page.getByRole("button", { name: "3D 표지 다시 편집" }).click();
    await expect(editor.getByText("적용됨")).toHaveCount(3);
    await expect(editor.locator("img")).toHaveCount(3);
    await page.getByLabel("책 각도").fill("-40");
    await apply.click();
    await expect(editor).toHaveCount(0);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(saved);
    const rotated = check(
      await db.from("books").select("cover_url,cover_design").eq("id", bookId).single(),
    ).data;
    expect(rotated.cover_url).not.toBe(book.cover_url);
    paths.add(pathOf(rotated.cover_url));
    expect(rotated.cover_design.angle).toBe(-40);
    expect(rotated.cover_design.images).toEqual(book.cover_design.images);
    expect((await db.storage.from("covers").download(pathOf(book.cover_url))).error).toBeTruthy();

    // 책등을 제거하면 그 파일만 회수되고 나머지 면은 유지된다.
    await page.goto(`/admin/books/${bookId}`);
    await page.getByRole("button", { name: "3D 표지 다시 편집" }).click();
    await expect(editor.getByText("적용됨")).toHaveCount(3);
    await page.getByRole("button", { name: "책등 제거", exact: true }).click();
    await expect(editor.getByText("비우면 제목·저자로 그립니다.")).toHaveCount(1);
    await apply.click();
    await expect(editor).toHaveCount(0);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(saved);
    const trimmed = check(
      await db.from("books").select("cover_url,cover_design").eq("id", bookId).single(),
    ).data;
    paths.add(pathOf(trimmed.cover_url));
    expect(trimmed.cover_design.images.spine).toBeUndefined();
    expect(trimmed.cover_design.images.front).toBe(book.cover_design.images.front);
    expect(trimmed.cover_design.images.back).toBe(book.cover_design.images.back);
    expect(
      (await db.storage.from("covers").download(pathOf(book.cover_design.images.spine))).error,
    ).toBeTruthy();
    expect(
      (await db.storage.from("covers").download(pathOf(book.cover_design.images.front))).error,
    ).toBeNull();

    // 직접 업로드로 교체하면 설정과 면 파일이 전부 사라진다.
    await page.goto(`/admin/books/${bookId}`);
    const upload = new PNG({ width: 80, height: 120 });
    upload.data.fill(190);
    await page.getByLabel("표지 이미지", { exact: true }).setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: PNG.sync.write(upload),
    });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page).toHaveURL(saved);
    const replaced = check(
      await db.from("books").select("cover_url,cover_design").eq("id", bookId).single(),
    ).data;
    paths.add(pathOf(replaced.cover_url));
    expect(replaced.cover_design).toBeNull();
    for (const face of ["front", "back"] as const)
      expect(
        (await db.storage.from("covers").download(pathOf(book.cover_design.images[face]))).error,
      ).toBeTruthy();
  } finally {
    if (bookId) check(await db.from("books").delete().eq("id", bookId));
    if (paths.size) await db.storage.from("covers").remove([...paths]);
  }
});

test("admin: image template rejects a tampered face address that is not the saved one", async ({
  page,
  context,
}) => {
  await authenticate(context, "admin");
  await page.goto("/admin/books/new");
  await page.getByLabel("제목 *", { exact: true }).fill("주소 위조 검증");
  await page.getByLabel("저자 *", { exact: true }).fill("현진건");
  await page.getByLabel("카테고리 *", { exact: true }).fill("소설");
  await page.getByLabel("ISBN", { exact: true }).fill("9788936434267");
  await page.getByRole("button", { name: "3D 표지 만들기", exact: true }).click();
  const apply = page.getByRole("button", { name: "이미지로 적용", exact: true });
  await expect(apply).toBeEnabled();
  await page.getByRole("button", { name: "면별로 올립니다", exact: false }).click();
  await page.getByLabel("앞표지 이미지 (필수)", { exact: true }).setInputFiles({
    name: "front.png",
    mimeType: "image/png",
    buffer: framed(300, 450, [20, 20, 20], [20, 20, 20], 0),
  });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(page.getByRole("region", { name: "3D 표지 편집기" })).toHaveCount(0);
  // 폼의 앞표지 파일을 비우고 주소만 남기면 서버는 그 주소를 믿지 않는다.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[name="cover_image_front"]')!;
    input.files = new DataTransfer().files;
    const design = document.querySelector<HTMLInputElement>('input[name="cover_design"]')!;
    const value = JSON.parse(design.value);
    value.images.front = "https://attacker.example/storage/v1/object/public/covers/x/design-front-1.webp";
    design.value = JSON.stringify(value);
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page).toHaveURL(/error=/);
  await expect(page.locator("p[role=alert]")).toContainText(
    "앞표지 이미지를 다시 올려 주세요.",
  );
});
