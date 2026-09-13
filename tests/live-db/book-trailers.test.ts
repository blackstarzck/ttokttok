import { test } from 'node:test';
import assert from 'node:assert/strict';
import { account, serviceDb, publicDb, ids, check } from './fixtures.ts';

const YT = 'dQw4w9WgXcQ';

test('book trailer: permission, verified bundle, exclusivity with posts, source switching, cleanup lock, cascade', async () => {
  const { db: admin, user } = await account('admin');
  const { db: reader } = await account('user');
  const service = serviceDb();
  const group = crypto.randomUUID();
  const file = `bundles/${group}/test.ts`;
  const bookId = crypto.randomUUID();
  let post: string | undefined;
  check(await service.from('books').insert({ id: bookId, title: '트레일러 테스트', author: '테스트 작가', category: '소설', isbn: '9788900000001' }));
  check(await service.from('video_uploads').insert({ id: group, created_by: user.id, manifest: { duration: 6, renditions: [{ label: '480p', width: 480, height: 852, bandwidth: 1, playlist: '480p/index.m3u8' }] }, public_base: `https://example.test/${group}` }));
  try {
    const yt = { p_book_id: bookId, p_source: 'youtube', p_youtube_id: YT };
    assert.ok((await reader.rpc('save_book_trailer', yt)).error, 'reader rejected');
    assert.ok((await publicDb().rpc('save_book_trailer', yt)).error, 'anon rejected');
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'youtube', p_youtube_id: 'short' })).error, 'bad youtube id rejected');
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: crypto.randomUUID(), p_source: 'youtube', p_youtube_id: YT })).error, 'unknown book rejected');

    check(await admin.rpc('save_book_trailer', yt));
    let row = check(await service.from('book_trailers').select('*').eq('book_id', bookId).single()).data;
    assert.equal(row.source_type, 'youtube'); assert.equal(row.youtube_id, YT); assert.equal(row.asset_group_id, null);
    // 읽기는 공개다 — 다음 단계(도서 시트)가 anon으로 읽는다.
    assert.equal(check(await publicDb().from('book_trailers').select('youtube_id').eq('book_id', bookId).single()).data.youtube_id, YT);

    const up = { p_book_id: bookId, p_source: 'upload', p_upload_id: group };
    assert.ok((await admin.rpc('save_book_trailer', up)).error, 'unverified bundle rejected');
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'upload' })).error, 'upload without bundle and without previous upload rejected');
    check(await admin.storage.from('videos').upload(file, new Uint8Array([1, 2, 3]), { contentType: 'video/mp2t' }));
    check(await service.from('video_uploads').update({ status: 'ready' }).eq('id', group));

    // 게시물이 먼저 쓴 묶음은 트레일러에 못 붙인다.
    post = check(await admin.rpc('save_video_post', { p_id: null, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: false, p_source: 'upload', p_upload_id: group })).data;
    assert.ok((await admin.rpc('save_book_trailer', up)).error, 'bundle attached to a post is rejected for a trailer');
    check(await admin.rpc('save_video_post', { p_id: post, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: false, p_source: 'youtube', p_youtube_id: YT }));

    check(await admin.rpc('save_book_trailer', up));
    row = check(await service.from('book_trailers').select('*').eq('book_id', bookId).single()).data;
    assert.equal(row.source_type, 'upload'); assert.equal(row.youtube_id, null);
    assert.equal(row.hls_path, `https://example.test/${group}/master.m3u8`);
    assert.equal(row.video_path, `https://example.test/${group}/fallback.mp4`);
    assert.equal(row.poster_path, `https://example.test/${group}/poster.jpg`);
    assert.equal(row.duration_sec, 6); assert.equal(row.asset_group_id, group);

    // 트레일러가 쓰는 묶음은 게시물에 못 붙이고, 정리도 못 한다.
    assert.ok((await admin.rpc('save_video_post', { p_id: post, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: false, p_source: 'upload', p_upload_id: group })).error, 'bundle attached to a trailer is rejected for a post');
    assert.equal(check(await service.rpc('claim_video_cleanup', { p_id: group })).data, false, 'cleanup locked while trailer references the bundle');
    // 같은 도서에 upload_id 없이 다시 저장하면 기존 영상을 유지한다.
    check(await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'upload' }));
    assert.equal(check(await service.from('book_trailers').select('asset_group_id').eq('book_id', bookId).single()).data.asset_group_id, group);
    // 다른 도서는 같은 묶음을 못 쓴다.
    assert.ok((await admin.rpc('save_book_trailer', { p_book_id: ids.linkBook, p_source: 'upload', p_upload_id: group })).error, 'bundle is exclusive to one trailer');

    // youtube로 돌리면 업로드 필드가 비고, 묶음은 정리 가능해진다.
    check(await admin.rpc('save_book_trailer', yt));
    row = check(await service.from('book_trailers').select('*').eq('book_id', bookId).single()).data;
    assert.equal(row.asset_group_id, null); assert.equal(row.hls_path, null); assert.equal(row.renditions, null);
    assert.equal(check(await service.rpc('claim_video_cleanup', { p_id: group })).data, true);
    check(await service.from('video_uploads').update({ status: 'ready' }).eq('id', group)); // 다음 단언을 위해 되돌린다

    // none → 행 삭제. 도서 삭제 → cascade.
    check(await admin.rpc('save_book_trailer', { p_book_id: bookId, p_source: 'none' }));
    assert.equal((await service.from('book_trailers').select('book_id').eq('book_id', bookId).maybeSingle()).data, null);
    check(await admin.rpc('save_book_trailer', yt));
    check(await service.from('books').delete().eq('id', bookId));
    assert.equal((await service.from('book_trailers').select('book_id').eq('book_id', bookId).maybeSingle()).data, null, 'cascade on book delete');
  } finally {
    if (post) check(await service.from('posts').delete().eq('id', post));
    await service.from('books').delete().eq('id', bookId);
    check(await service.from('video_uploads').delete().eq('id', group));
    check(await service.storage.from('videos').remove([file]));
  }
});
