import { test } from 'node:test';
import assert from 'node:assert/strict';
import { account, serviceDb, publicDb, ids, check } from './fixtures.ts';

test('video transaction: verified metadata, rollback, legacy retention and cleanup lock', async () => {
  const { db: admin, user } = await account('admin');
  const { db: reader } = await account('user');
  const service = serviceDb();
  const group = crypto.randomUUID();
  const file = `bundles/${group}/test.ts`;
  let post: string | undefined;
  const args = { p_id: null, p_channel_id: ids.channel, p_book_id: ids.book, p_publish: true, p_source: 'upload', p_upload_id: group };
  check(await service.from('video_uploads').insert({ id: group, created_by: user.id, manifest: { duration: 6, renditions: [] }, public_base: `https://example.test/${group}` }));
  try {
    assert.ok((await reader.rpc('save_video_post', args)).error);
    assert.ok((await publicDb().rpc('save_video_post', args)).error);
    assert.ok((await admin.from('video_uploads').update({ status: 'ready' }).eq('id', group)).error);
    assert.ok((await admin.rpc('save_video_post', args)).error, 'unverified bundle rejected');
    assert.ok((await admin.rpc('save_video_post', { ...args, p_source: null })).error, 'null source rejected');
    check(await admin.storage.from('videos').upload(file, new Uint8Array([1, 2, 3]), { contentType: 'video/mp2t' }));
    check(await service.from('video_uploads').update({ status: 'ready' }).eq('id', group));
    assert.ok((await admin.storage.from('videos').upload(file, new Uint8Array([4, 5, 6]), { contentType: 'video/mp2t', upsert: true })).error, 'ready bundle is immutable');
    post = check(await admin.rpc('save_video_post', args)).data;
    const old = check(await service.from('posts').select('*').eq('id', post!).single()).data;
    const video = check(await service.from('post_videos').select('*').eq('post_id', post!).single()).data;
    assert.equal(video.hls_path, `https://example.test/${group}/master.m3u8`);
    assert.equal(check(await service.rpc('claim_video_cleanup', { p_id: group })).data, false);
    assert.ok((await admin.rpc('save_video_post', { ...args, p_id: post, p_book_id: crypto.randomUUID(), p_publish: false })).error);
    assert.equal(check(await service.from('posts').select('status').eq('id', post!).single()).data.status, old.status);
    check(await admin.rpc('save_video_post', { ...args, p_id: post, p_upload_id: null }));
    assert.equal(check(await service.from('posts').select('published_at').eq('id', post!).single()).data.published_at, old.published_at);
    check(await admin.rpc('save_video_post', { ...args, p_id: post, p_source: 'youtube', p_youtube_id: 'dQw4w9WgXcQ', p_upload_id: null }));
    assert.equal(check(await service.rpc('claim_video_cleanup', { p_id: group })).data, true);
    assert.ok((await admin.rpc('save_video_post', { ...args, p_id: post })).error, 'deleting group cannot be attached');
    assert.ok((await admin.storage.from('videos').upload(`bundles/${group}/late.ts`, new Uint8Array([7]), { contentType: 'video/mp2t' })).error, 'late request cannot recreate deleted files');
  } finally {
    if (post) check(await service.from('posts').delete().eq('id', post));
    check(await service.from('video_uploads').delete().eq('id', group));
    check(await service.storage.from('videos').remove([file]));
  }
});
