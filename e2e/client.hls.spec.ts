import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { serviceDb, check, ids } from './helpers';
import { hlsFixture } from './video-fixture';
import { videoContentType } from '@ttokttok/shared/video-bundle';

const posts = Array.from({ length: 5 }, (_, i) => `45000000-0000-4000-8000-00000000000${i}`);
const db = serviceDb();
test.use({ deviceScaleFactor: 3 });
test.beforeAll(async () => {
  test.setTimeout(180000);
  const fixture = hlsFixture();
  const publishedAt = Date.now();
  for (let i = 0; i < posts.length; i++) {
    for (const file of fixture.manifest.files) check(await db.storage.from('videos').upload(`tests/hls/${i}/${file.path}`, readFileSync(`${fixture.directory}/${file.path}`), { contentType: videoContentType(file.path), upsert: true }));
    const base = db.storage.from('videos').getPublicUrl(`tests/hls/${i}`).data.publicUrl;
    check(await db.from('posts').upsert({ id: posts[i], channel_id: ids.channel, book_id: ids.book, type: 'video', status: 'published', published_at: new Date(publishedAt - i * 1000).toISOString() }));
    check(await db.from('post_videos').upsert({ post_id: posts[i], source_type: 'upload', video_path: `${base}/fallback.mp4`, hls_path: `${base}/master.m3u8`, poster_path: `${base}/poster.jpg`, duration_sec: 36 }));
  }
});
test.afterAll(async () => {
  check(await db.from('posts').delete().in('id', posts));
  const fixture = hlsFixture();
  for (let i = 0; i < posts.length; i++) check(await db.storage.from('videos').remove(fixture.manifest.files.map(f => `tests/hls/${i}/${f.path}`)));
});
const clip = (page: Page, i: number) => page.locator(`[data-post-id="${posts[i]}"] video`);
async function scroll(page: Page, i: number) {
  await page.locator(`[data-post-id="${posts[i]}"]`).evaluate(el => {
    el.parentElement!.scrollTop = Number((el as HTMLElement).dataset.index) * el.parentElement!.clientHeight;
  });
}
async function playing(page: Page, i: number) {
  await expect.poll(() => clip(page, i).evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 3)).toBe(true);
}

test('HLS: lowest neighbour segment only, automatic quality, rapid reverse, fallback', async ({ page }, info) => {
  await page.addInitScript(() => {
    // Exercise the MediaSource path even when this Chromium build advertises native HLS.
    const canPlay = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) { return type.includes('mpegurl') ? '' : canPlay.call(this, type); };
    Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }) });
  });
  const segments: string[] = [];
  page.on('request', request => { if (/\/tests\/hls\/.*\.ts$/.test(request.url())) segments.push(request.url()); });
  await page.goto(`/channel/test-walk/reels?start=${posts[0]}`);
  await playing(page, 0);
  await expect.poll(() => clip(page, 1).evaluate((v: HTMLVideoElement) => v.buffered.length)).toBeGreaterThan(0);
  expect(segments.filter(url => url.includes('/hls/1/')).map(url => url.split('/hls/1/')[1])).toEqual(['480p/segment_0000.ts']);
  expect(segments.some(url => url.includes('/hls/0/720p/') || url.includes('/hls/0/1080p/'))).toBe(true);
  const start = Date.now();
  await scroll(page, 1); await playing(page, 1);
  await info.attach('hls-transition', { body: JSON.stringify({ transitionMs: Date.now() - start }), contentType: 'application/json' });
  await scroll(page, 3); await playing(page, 3);
  await scroll(page, 2); await playing(page, 2);
  await expect(clip(page, 4)).not.toHaveAttribute('src');
  expect(await page.locator('video').evaluateAll(videos => videos.filter(v => !(v as HTMLVideoElement).paused).length)).toBe(1);
  await page.route('**/tests/hls/0/*.m3u8', route => route.fulfill({ status: 404 }));
  await page.goto(`/p/${posts[0]}`);
  await expect(page.locator('video')).toHaveAttribute('src', /fallback\.mp4/, { timeout: 30000 });
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 3)).toBe(true);
});

test('HLS: data saver disables speculation; manual pause survives a return', async ({ page }) => {
  await page.addInitScript(() => {
    const canPlay = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) { return type.includes('mpegurl') ? '' : canPlay.call(this, type); };
    Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g' }) });
  });
  await page.goto(`/channel/test-walk/reels?start=${posts[0]}`);
  await playing(page, 0);
  await expect(clip(page, 1)).not.toHaveAttribute('src');
  await page.locator(`[data-post-id="${posts[0]}"]`).getByRole('button', { name: '일시정지', exact: true }).click();
  await scroll(page, 1); await playing(page, 1);
  await scroll(page, 0);
  await expect(page.locator(`[data-post-id="${posts[0]}"]`).getByRole('button', { name: '재생', exact: true })).toBeVisible();
  expect(await clip(page, 0).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test('native HLS: neighbour uses metadata and preserves the browser playback path', async ({ page }) => {
  const supported = await page.evaluate(() => Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl')));
  test.skip(!supported, 'This installed browser does not support native HLS.');
  await page.addInitScript(() => { Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }) }); });
  await page.goto(`/channel/test-walk/reels?start=${posts[0]}`);
  await playing(page, 0);
  await expect(clip(page, 1)).toHaveAttribute('preload', 'metadata');
  expect(await clip(page, 1).evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await scroll(page, 1); await playing(page, 1);
});

test('HLS performance: 30 cold starts and prepared transitions at 8 Mbps / 120 ms', async ({ page }, info) => {
  test.setTimeout(240000);
  await page.addInitScript(([first, second]) => {
    const canPlay = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function(type) { return type.includes('mpegurl') ? '' : canPlay.call(this, type); };
    Object.defineProperty(navigator, 'connection', { configurable: true, value: Object.assign(new EventTarget(), { saveData: false, effectiveType: '4g' }) });
    const metrics = { began: 0, first: 0, swipe: 0, after: 0 };
    Object.assign(window, { hlsMetrics: metrics });
    const observer = new MutationObserver(() => {
      if (document.querySelector(`[data-post-id="${first}"] video`)) { metrics.began = performance.now(); observer.disconnect(); }
    });
    observer.observe(document, { subtree: true, childList: true });
    document.addEventListener('playing', e => {
      const id = (e.target as HTMLElement)?.closest('[data-post-id]')?.getAttribute('data-post-id');
      if (id === first && !metrics.first) metrics.first = performance.now() - metrics.began;
      if (id === second && metrics.swipe && !metrics.after) metrics.after = performance.now() - metrics.swipe;
    }, true);
  }, [posts[0], posts[1]]);
  const network = await page.context().newCDPSession(page);
  await network.send('Network.enable');
  await network.send('Network.setCacheDisabled', { cacheDisabled: true });
  await network.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: 1_000_000, uploadThroughput: 125_000, connectionType: 'cellular4g' });
  const runs: { first: number; after: number }[] = [];
  for (let i = 0; i < 30; i++) {
    await page.goto(`/channel/test-walk/reels?start=${posts[0]}`);
    await playing(page, 0);
    await expect.poll(() => clip(page, 1).evaluate((v: HTMLVideoElement) => v.buffered.length)).toBeGreaterThan(0);
    await page.evaluate(() => { (window as unknown as { hlsMetrics: { swipe: number } }).hlsMetrics.swipe = performance.now(); });
    await scroll(page, 1); await playing(page, 1);
    runs.push(await page.evaluate(() => {
      const m = (window as unknown as { hlsMetrics: { first: number; after: number } }).hlsMetrics;
      return { first: m.first, after: m.after };
    }));
  }
  const p95 = (key: 'first' | 'after') => runs.map(r => r[key]).sort((a, b) => a - b)[Math.ceil(runs.length * .95) - 1];
  await info.attach('hls-30-runs', { body: JSON.stringify({ downloadMbps: 8, latencyMs: 120, coldCache: true, p95FirstMs: p95('first'), p95PreparedMs: p95('after'), runs }, null, 2), contentType: 'application/json' });
  expect(runs.every(r => r.first > 0 && r.after > 0)).toBe(true);
  expect(p95('first')).toBeLessThanOrEqual(2000);
  expect(p95('after')).toBeLessThanOrEqual(500);
});
