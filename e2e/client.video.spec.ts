import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { serviceDb, check, ids } from "../tests/live-db/fixtures";

const postIds = Array.from({ length: 7 }, (_, i) => `44000000-0000-4000-8000-00000000000${i}`);
const db = serviceDb();

test.beforeAll(async () => {
  mkdirSync(".tmp/test-assets", { recursive: true });
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
    "testsrc2=size=1080x1920:rate=24:duration=6", "-c:v", "libx264", "-preset", "ultrafast",
    "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", ".tmp/test-assets/reels-hd.mp4"]);
  check(await db.storage.from("videos").upload("tests/reels-hd.mp4", readFileSync(".tmp/test-assets/reels-hd.mp4"), { contentType: "video/mp4", upsert: true }));
  const url = db.storage.from("videos").getPublicUrl("tests/reels-hd.mp4").data.publicUrl;
  check(await db.from("posts").upsert(postIds.map((id, i) => ({
    id, channel_id: ids.channel, book_id: ids.book, type: "video", status: "published",
    published_at: new Date(Date.now() - i * 1000).toISOString(),
  }))));
  check(await db.from("post_videos").upsert(postIds.map((post_id, i) => ({
    post_id, source_type: "upload", video_path: `${url}?clip=${i}`, duration_sec: 6,
  }))));
});

test.afterAll(async () => {
  check(await db.from("posts").delete().in("id", postIds));
  check(await db.storage.from("videos").remove(["tests/reels-hd.mp4"]));
});

const clip = (page: Page, i: number) => page.locator(`[data-post-id="${postIds[i]}"] video`);
const slot = (page: Page, i: number) => page.locator(`[data-post-id="${postIds[i]}"]`);
async function scrollTo(page: Page, i: number) {
  await slot(page, i).evaluate((el) => {
    const container = el.parentElement!;
    container.scrollTop = Number((el as HTMLElement).dataset.index) * container.clientHeight;
  });
}
async function playing(page: Page, i: number) {
  await expect.poll(() => clip(page, i).evaluate((el: HTMLVideoElement) => !el.paused && el.readyState >= 3)).toBe(true);
}
async function connection(page: Page, saveData = false) {
  await page.addInitScript((saveData) => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: Object.assign(new EventTarget(), { saveData, effectiveType: "4g" }) });
  }, saveData);
}

test("video: current playback wins; only one neighbour loads; rapid/reverse swipes release old videos", async ({ page }, testInfo) => {
  await connection(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requests = new Set<string>();
  await page.route("**/reels-hd.mp4?*", async (route) => {
    const index = new URL(route.request().url()).searchParams.get("clip")!;
    requests.add(index);
    if (index === "0") await gate;
    await route.continue();
  });
  await page.goto(`/channel/test-walk/reels?start=${postIds[0]}`);
  try {
    await expect(clip(page, 0)).toHaveAttribute("src", /clip=0/);
    await expect(page.getByRole("status").filter({ hasText: "영상을" })).toBeVisible();
    expect([...requests]).toEqual(["0"]);
    await expect(page.locator("video[src]")).toHaveCount(1);
    await testInfo.attach("video-wait-375", { body: await page.screenshot(), contentType: "image/png" });
  } finally { release(); }
  await playing(page, 0);
  await expect(page.locator("video[src]")).toHaveCount(2);
  await expect(clip(page, 1)).toHaveAttribute("src", /clip=1/);
  expect(await clip(page, 1).evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await scrollTo(page, 3);
  await playing(page, 3);
  await scrollTo(page, 6);
  await playing(page, 6);
  await expect(clip(page, 0)).toHaveCount(0);
  await expect(clip(page, 4)).not.toHaveAttribute("src");
  await scrollTo(page, 5);
  await playing(page, 5);
  await expect(clip(page, 4)).toHaveAttribute("src", /clip=4/);
  await expect(clip(page, 6)).not.toHaveAttribute("src");
  expect(await page.locator("video").evaluateAll((els) => els.filter((el) => !(el as HTMLVideoElement).paused).length)).toBe(1);
  await testInfo.attach("video-playing-375", { body: await page.screenshot(), contentType: "image/png" });
});

test("video: data saver skips preloading and a deliberate pause survives leaving and returning", async ({ page }) => {
  await connection(page, true);
  await page.goto(`/channel/test-walk/reels?start=${postIds[0]}`);
  await playing(page, 0);
  await expect.poll(() => clip(page, 0).evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(0.5);
  await expect(page.locator("video[src]")).toHaveCount(1);
  await slot(page, 0).getByRole("button", { name: "일시정지", exact: true }).click();
  await scrollTo(page, 1);
  await playing(page, 1);
  await scrollTo(page, 0);
  await expect(clip(page, 0)).toHaveAttribute("src", /clip=0/);
  await expect(slot(page, 0).getByRole("button", { name: "재생", exact: true })).toBeVisible();
  expect(await clip(page, 0).evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
  await slot(page, 0).getByRole("button", { name: "재생", exact: true }).click();
  await playing(page, 0);
});

test("video: a failed download offers retry and recovers", async ({ page }) => {
  await connection(page, true);
  await page.route("**/reels-hd.mp4?clip=0", (route) => route.abort("failed"));
  await page.goto(`/channel/test-walk/reels?start=${postIds[0]}`);
  await expect(page.getByText("영상을 불러오지 못했어요.", { exact: true })).toBeVisible();
  await page.unroute("**/reels-hd.mp4?clip=0");
  await page.getByRole("button", { name: "영상 다시 시도", exact: true }).click();
  await playing(page, 0);
});

test("video: high bitrate footage plays and advances under a constrained connection", async ({ page }, testInfo) => {
  await connection(page);
  const network = await page.context().newCDPSession(page);
  await network.send("Network.enable");
  await network.send("Network.emulateNetworkConditions", {
    offline: false, latency: 120, downloadThroughput: 1_000_000,
    uploadThroughput: 125_000, connectionType: "cellular4g",
  });
  await page.goto(`/channel/test-walk/reels?start=${postIds[0]}`);
  await playing(page, 0);
  // Native preload is a hint: Chromium may prepare only the initial frames.
  // Do not mistake admission's 3-second CURRENT buffer for a neighbour guarantee.
  await expect.poll(() => clip(page, 1).evaluate((el: HTMLVideoElement) =>
    el.buffered.length ? el.buffered.end(0) : 0), { timeout: 30_000 }).toBeGreaterThan(0);
  const preparedSeconds = await clip(page, 1).evaluate((el: HTMLVideoElement) => el.buffered.end(0));
  const started = Date.now();
  await scrollTo(page, 1);
  await playing(page, 1);
  await testInfo.attach("constrained-network", {
    body: JSON.stringify({ resolution: "1080x1920", durationSec: 6, bytes: 9268586,
      downloadMbps: 8, latencyMs: 120, preparedSeconds, preparedTransitionMs: Date.now() - started }),
    contentType: "application/json",
  });
});

test("video: YouTube API contract prepares a neighbour without background autoplay", async ({ page }) => {
  // Verify our API integration only; this does not simulate YouTube delivery speed.
  check(await db.from("post_videos").update({ source_type: "youtube", video_path: null, youtube_id: "M7lc1UVf-VE" }).in("post_id", postIds));
  await connection(page);
  await page.addInitScript(`
    window.__ytStats = [];
    window.YT = { PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 }, Player: class {
      constructor(target, options) {
        this.options = options; this.state = -1;
        this.stats = { autoplay: options.playerVars.autoplay, plays: 0, destroyed: false, state: -1 };
        window.__ytStats.push(this.stats);
        setTimeout(() => options.events.onReady(), 0);
      }
      playVideo() { this.stats.plays++; this.state = this.stats.state = 1; this.options.events.onStateChange({ data: 1 }); }
      pauseVideo() { this.state = this.stats.state = 2; this.options.events.onStateChange({ data: 2 }); }
      getDuration() { return 10; }
      getCurrentTime() { return 1; }
      getVideoLoadedFraction() { return 1; }
      getPlayerState() { return this.state; }
      isMuted() { return true; }
      mute() {} unMute() {} seekTo() {}
      destroy() { this.stats.destroyed = true; this.stats.state = -1; }
    }};
  `);
  await page.goto(`/channel/test-walk/reels?start=${postIds[0]}`);
  await expect.poll(() => page.evaluate("window.__ytStats.length")).toBe(2);
  expect(await page.evaluate("window.__ytStats.every(p => p.autoplay === 0)")).toBe(true);
  expect(await page.evaluate("window.__ytStats[1].plays")).toBe(0);
  await scrollTo(page, 1);
  await expect.poll(() => page.evaluate("window.__ytStats[1].plays")).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate("window.__ytStats[0].destroyed")).toBe(true);
  await expect.poll(() => page.evaluate("window.__ytStats.length")).toBe(3);
  expect(await page.evaluate("window.__ytStats.filter(p => p.state === 1).length")).toBe(1);
  expect(await page.evaluate("window.__ytStats[2].plays")).toBe(0);
});
