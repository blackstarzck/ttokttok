import { test, expect } from '@playwright/test';
import { authenticate, serviceDb, ids, check, clientOrigin, adminOrigin } from './helpers';
import { hlsFixture } from './video-fixture';

test('admin video: ZIP upload, interruption/retry, preview, atomic publication and guarded cleanup', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(240000);
  const fixture = hlsFixture();
  expect(fixture.manifest.files.find(f => f.path === 'fallback.mp4')!.size).toBeGreaterThan(6 * 1024 * 1024);
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/posts/new?type=video');
  await page.getByLabel('채널 *').selectOption(ids.channel);
  await page.getByLabel('도서 *', { exact: true }).selectOption(ids.book);
  await page.getByLabel('변환한 영상 ZIP').setInputFiles(fixture.zip);
  await expect(page.getByText(/480p · 720p · 1080p/)).toBeVisible();
  await expect(page.getByRole('button', { name: '발행', exact: true })).toBeDisabled();
  const successes = new Map<string, number>();
  let resumableRequests = 0;
  let previewViews = 0;
  page.on('request', request => {
    if (request.url().includes('/upload/resumable')) resumableRequests++;
    if (request.url().includes('/rpc/record_view')) previewViews++;
  });
  let failOne = true;
  await page.route('**/storage/v1/object/videos/bundles/**', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    if (route.request().url().includes('segment_0001.ts') && failOne) {
      failOne = false; await route.abort('failed'); return;
    }
    successes.set(route.request().url(), (successes.get(route.request().url()) ?? 0) + 1);
    await route.continue();
  });
  await page.getByRole('button', { name: '영상 업로드', exact: true }).click();
  await expect(page.getByRole('button', { name: '실패한 파일 이어 올리기' })).toBeVisible({ timeout: 60000 });
  const uploaded = new Map(successes);
  await page.getByRole('button', { name: '실패한 파일 이어 올리기' }).click();
  await expect(page.getByText('업로드 확인 완료. 발행하거나 임시저장하세요.')).toBeVisible({ timeout: 60000 });
  expect(resumableRequests).toBeGreaterThan(0);
  for (const [url, count] of uploaded) expect(successes.get(url), 'completed files are retained').toBe(count);
  const group = await page.locator('[name="video_upload_id"]').inputValue();
  const db = serviceDb();
  let post: string | undefined;
  const client = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    await page.locator('video').evaluate((video: HTMLVideoElement) => video.play());
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
    await page.getByLabel(/미리보기 화질/).selectOption('2');
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.videoHeight)).toBe(1920);
    await page.getByLabel(/미리보기 화질/).selectOption('-1');
    expect(previewViews).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await testInfo.attach('admin-video-preview-375', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.getByRole('button', { name: '발행', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/posts(?:\?|$)/);
    const video = check(await db.from('post_videos').select('*').eq('asset_group_id', group).single()).data;
    post = video.post_id;
    await client.goto(`${clientOrigin()}/p/${post}`);
    await expect.poll(() => client.locator('video').evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= 3)).toBe(true);
    expect(video.hls_path).toContain(`/bundles/${group}/master.m3u8`);
    const result = await page.evaluate(async id => {
      const response = await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', id }) });
      return response.status;
    }, group);
    expect(result).toBe(400);
  } finally {
    await client.close();
    post ??= (await db.from('post_videos').select('post_id').eq('asset_group_id', group).maybeSingle()).data?.post_id;
    if (post) check(await db.from('posts').delete().eq('id', post));
    await page.evaluate(async id => { await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', id }) }); }, group);
  }
});

test('admin video: permission, incomplete upload and forged playlist fail without publishing', async ({ page, context, request }) => {
  const forbidden = await request.post(`${adminOrigin()}/api/video-uploads`, { maxRedirects: 0, data: { action: 'start', manifest: {} } });
  expect([303, 307, 403]).toContain(forbidden.status());
  await authenticate(context, 'admin');
  await page.goto('/admin/posts/new?type=video');
  const fixture = hlsFixture();
  const result = await page.evaluate(async manifest => {
    const post = async (body: object) => {
      const response = await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    };
    const upload = await post({ action: 'start', manifest });
    try { return { started: upload.status, completed: (await post({ action: 'complete', id: upload.data.id })).status }; }
    finally { await post({ action: 'cleanup', id: upload.data.id }); }
  }, fixture.manifest);
  expect(result).toEqual({ started: 200, completed: 400 });
  await page.getByLabel('변환한 영상 ZIP').setInputFiles({ name: 'invalid.zip', mimeType: 'application/zip', buffer: Buffer.from('invalid') });
  await expect(page.getByRole('alert').filter({ hasText: 'ZIP 파일을 읽을 수 없습니다.' })).toBeVisible();
  await expect(page.getByRole('button', { name: '발행', exact: true })).toBeDisabled();
});

test('admin video: cancel stops transfer and allows continuing the same bundle', async ({ page, context }) => {
  test.setTimeout(90000);
  await authenticate(context, 'admin');
  await page.goto('/admin/posts/new?type=video');
  await page.getByLabel('변환한 영상 ZIP').setInputFiles(hlsFixture().zip);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let waiting = 0;
  await page.route('**/storage/v1/object/videos/bundles/**', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    waiting++; await gate;
    await route.continue().catch(() => {}); // The browser may have cancelled while the route was held.
  });
  const started = page.waitForResponse(response => response.url().endsWith('/api/video-uploads') && response.request().postDataJSON()?.action === 'start');
  await page.getByRole('button', { name: '영상 업로드', exact: true }).click();
  const { id } = await (await started).json();
  try {
    await expect.poll(() => waiting).toBeGreaterThan(0);
    await page.getByRole('button', { name: '업로드 중단', exact: true }).click();
    release();
    await expect(page.getByRole('button', { name: '실패한 파일 이어 올리기' })).toBeVisible();
    await expect(page.locator('[name="video_upload_id"]')).toHaveValue('');
    await page.unroute('**/storage/v1/object/videos/bundles/**');
    await page.getByRole('button', { name: '실패한 파일 이어 올리기' }).click();
    await expect(page.getByText('업로드 확인 완료. 발행하거나 임시저장하세요.')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[name="video_upload_id"]')).toHaveValue(id);
  } finally {
    release();
    await page.evaluate(async id => { await fetch('/api/video-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cleanup', id }) }); }, id);
  }
});
