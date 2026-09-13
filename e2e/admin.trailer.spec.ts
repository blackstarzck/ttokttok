import { test, expect, authenticate, serviceDb, check, adminOrigin } from './helpers';
import { mp4Fixture } from './video-fixture';

// page.request는 브라우저 페이지가 아니라 컨텍스트의 API 클라이언트를 쓴다 — 인증
// 쿠키는 그대로 공유되지만 page의 network 이벤트로는 안 잡혀, 의도적으로 유발한
// 400(사용 중인 묶음 정리 거부)이 helpers의 runtimeErrors 감시에 오탐으로 걸리지
// 않는다.
function cleanupUpload(page: import('@playwright/test').Page, id: string) {
  return page.request.post('/api/video-uploads', {
    headers: { origin: adminOrigin() },
    data: { action: 'cleanup', id },
  });
}

async function fillBook(page: import('@playwright/test').Page, title: string) {
  await page.goto('/admin/books/new');
  await page.getByLabel('제목 *', { exact: true }).fill(title);
  await page.getByLabel('저자 *', { exact: true }).fill('테스트 작가');
  await page.getByLabel('카테고리 *', { exact: true }).fill('소설');
  // EPUB 없이 저장하려면 ISBN이나 구매 링크가 있어야 한다 (books_needs_epub_or_store_ref).
  await page.getByLabel('ISBN', { exact: true }).fill('9788900000002');
}

test('admin trailer: youtube trailer is saved with the book, shown on edit, removed with 없음', async ({ page, context }) => {
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  const db = serviceDb();
  const title = '트레일러 유튜브 도서';
  await db.from('books').delete().eq('title', title);
  try {
    await fillBook(page, title);
    await page.getByLabel('트레일러 소스').selectOption('youtube');
    await page.getByLabel('유튜브 주소 또는 ID').fill('https://youtu.be/dQw4w9WgXcQ');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: title }).getByText('트레일러', { exact: true })).toBeVisible();
    const book = check(await db.from('books').select('id').eq('title', title).single()).data;
    const row = check(await db.from('book_trailers').select('*').eq('book_id', book.id).single()).data;
    expect(row).toMatchObject({ source_type: 'youtube', youtube_id: 'dQw4w9WgXcQ', asset_group_id: null });

    await page.goto(`/admin/books/${book.id}`);
    await expect(page.getByLabel('트레일러 소스')).toHaveValue('youtube');
    await expect(page.getByRole('img', { name: '트레일러 썸네일' })).toHaveAttribute('src', /dQw4w9WgXcQ/);
    await page.getByLabel('트레일러 소스').selectOption('none');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1|\/admin\/books$/);
    expect((await db.from('book_trailers').select('book_id').eq('book_id', book.id).maybeSingle()).data).toBeNull();
  } finally {
    await db.from('books').delete().eq('title', title);
  }
});

test('admin trailer: mp4 is converted in the browser, uploaded and attached', async ({ page, context }) => {
  test.setTimeout(600000);
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  const db = serviceDb();
  const title = '트레일러 변환 도서';
  await db.from('books').delete().eq('title', title);
  // 서버는 action:"start" 응답 시점에 이미 video_uploads 행과 스토리지 객체를
  // 만든다 — 화면에 "업로드 확인 완료"가 뜨기 전에 테스트가 실패해도 묶음을
  // 정리할 수 있도록, group을 그 네트워크 응답에서 곧바로 채운다.
  let group = '';
  page.on('response', async (response) => {
    const request = response.request();
    if (!response.url().includes('/api/video-uploads') || request.method() !== 'POST') return;
    let body: unknown = null;
    try { body = request.postDataJSON(); } catch { return; }
    if ((body as { action?: string } | null)?.action !== 'start') return;
    const json = await response.json().catch(() => null) as { id?: string } | null;
    if (json?.id) group = json.id;
  });
  try {
    await fillBook(page, title);
    await page.getByLabel('트레일러 소스').selectOption('upload');
    await page.getByLabel('영상 파일 또는 변환한 ZIP').setInputFiles(mp4Fixture());
    await expect(page.getByText(/360×640 · 3초/)).toBeVisible();
    await page.getByRole('button', { name: '변환', exact: true }).click();
    await expect(page.getByText(/변환 완료/)).toBeVisible({ timeout: 480000 });
    await page.getByRole('button', { name: '영상 업로드', exact: true }).click();
    await expect(page.getByText('업로드 확인 완료. 발행하거나 임시저장하세요.')).toBeVisible({ timeout: 120000 });
    const startedId = group;
    group = await page.locator('[name="video_upload_id"]').inputValue();
    expect(group).toBe(startedId);
    expect(group).toMatch(/^[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/books\?saved=1|\/admin\/books$/);
    const book = check(await db.from('books').select('id').eq('title', title).single()).data;
    const row = check(await db.from('book_trailers').select('*').eq('book_id', book.id).single()).data;
    expect(row.source_type).toBe('upload');
    expect(row.asset_group_id).toBe(group);
    expect(row.hls_path).toContain(`/bundles/${group}/master.m3u8`);
    expect(row.duration_sec).toBe(3);
    expect((await fetch(row.poster_path!)).status).toBe(200);

    await page.goto(`/admin/books/${book.id}`);
    await expect(page.getByLabel('트레일러 소스')).toHaveValue('upload');
    await expect(page.getByRole('img', { name: '현재 트레일러 첫 화면' })).toBeVisible();
    await expect(page.getByText(/현재 영상 · 360p/)).toBeVisible();

    // 사용 중인 묶음은 정리를 거부한다.
    const cleanupResponse = await cleanupUpload(page, group);
    expect(cleanupResponse.status()).toBe(400);
  } finally {
    // 책을 먼저 지워야 book_trailers 참조가 cascade로 사라지고, 그래야 묶음
    // 정리가 "사용 중" 거부(400)에 걸리지 않는다.
    await db.from('books').delete().eq('title', title);
    if (group) {
      try {
        const cleanupResponse = await cleanupUpload(page, group);
        if (!cleanupResponse.ok()) {
          console.warn(`영상 업로드 정리 실패 (${cleanupResponse.status()}): ${group} — 수동 정리가 필요합니다.`);
        }
      } catch (error) {
        console.warn(`영상 업로드 정리 요청 실패: ${group} — 수동 정리가 필요합니다.`, error);
      }
    }
  }
});

test('admin trailer: submitting an upload trailer before the upload finishes is blocked', async ({ page, context }) => {
  await authenticate(context, 'admin');
  await page.setViewportSize({ width: 375, height: 812 });
  const db = serviceDb();
  const title = '트레일러 가드 도서';
  await db.from('books').delete().eq('title', title);
  try {
    await fillBook(page, title);
    await page.getByLabel('트레일러 소스').selectOption('upload');
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '영상 업로드를 먼저 완료하세요' })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/books\/new/);
    expect(check(await db.from('books').select('id').eq('title', title).maybeSingle()).data).toBeNull();
  } finally {
    await db.from('books').delete().eq('title', title);
  }
});
