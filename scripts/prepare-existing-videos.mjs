import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { convertVideo } from './convert-video.mjs';

const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!origin || !key) throw new Error('프로젝트 환경 파일이 필요합니다.');
const db = createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
const output = resolve('.tmp', `video-migration-${Date.now()}`);
await mkdir(output, { recursive: true });
const rows = [];
for (let offset = 0; ; offset += 100) {
  // select(*) allows inventory before the additive HLS migration is deployed.
  const { data, error } = await db.from('post_videos').select('*, posts(*)').eq('source_type', 'upload').range(offset, offset + 99).order('post_id');
  if (error) throw error;
  rows.push(...data.filter(row => !row.hls_path));
  if (data.length < 100) break;
}
await writeFile(join(output, 'inventory.json'), JSON.stringify({ createdAt: new Date().toISOString(), videos: rows }, null, 2));
console.log(`기존 단일 파일 영상 ${rows.length}건. 목록: ${output}`);
if (process.argv.includes('--backup') || process.argv.includes('--convert')) {
  const flag = process.argv.indexOf('--limit');
  const limit = flag >= 0 ? Number(process.argv[flag + 1]) : 5;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit은 양의 정수여야 합니다.');
  const completed = [];
  for (const row of rows.slice(0, limit)) {
    const url = new URL(row.video_path);
    if (url.origin !== new URL(origin).origin || !url.pathname.startsWith('/storage/v1/object/public/videos/')) {
      console.log(`건너뜀: ${row.post_id} (프로젝트 저장소 밖의 주소)`); continue;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${row.post_id}: 다운로드 실패 (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const directory = join(output, row.post_id); await mkdir(directory);
    const source = join(directory, 'original.mp4'); await writeFile(source, bytes);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (createHash('sha256').update(await readFile(source)).digest('hex') !== hash) throw new Error('백업 검증 실패');
    const record = { postId: row.post_id, originalUrl: row.video_path, bytes: bytes.length, sha256: hash, source };
    completed.push(record);
    await writeFile(join(output, 'backup-verified.json'), JSON.stringify(completed, null, 2));
    console.log(`${row.post_id}: 백업 검증 완료`);
    if (process.argv.includes('--convert')) {
      await convertVideo(source, join(directory, 'web'));
      console.log(`관리자 /admin/posts/${row.post_id}에서 web.zip을 올리고 미리보기 후 저장하세요.`);
    }
  }
}
console.log('게시물 연결과 기존 파일은 변경하지 않았습니다.');
