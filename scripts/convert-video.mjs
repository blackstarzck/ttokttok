import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { parseVideoManifest, validateVideoPlaylist } from '../packages/shared/src/video-bundle.ts';
import { buildMasterPlaylist, buildVideoLadder, toManifestRendition } from '../packages/shared/src/video-ladder.ts';
import { fallbackArgs, hlsEncodeArgs, posterArgs } from '../packages/shared/src/video-encode.ts';

async function ffmpeg(args) {
  await new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = ''; p.stderr.on('data', b => { error = (error + b).slice(-8000); });
    p.on('error', fail); p.on('close', code => code === 0 ? ok() : fail(new Error(error || `ffmpeg 종료: ${code}`)));
  });
}

export async function convertVideo(input, output) {
  input = resolve(input);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', input], { windowsHide: true, encoding: 'utf8' }));
  const v = probe.streams.find(s => s.codec_type === 'video');
  const duration = Number(probe.format.duration);
  if (!v || !Number.isFinite(duration) || duration <= 0 || duration > 600) throw new Error('10분 이하의 영상 파일을 선택하세요.');
  const rotation = Number(v.side_data_list?.find(s => s.rotation !== undefined)?.rotation || v.tags?.rotate || 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  const width = rotated ? v.height : v.width, height = rotated ? v.width : v.height;
  const ladder = buildVideoLadder(width, height);
  const hdr = ['smpte2084', 'arib-std-b67'].includes(v.color_transfer);
  output = resolve(output || join(dirname(input), `${basename(input).replace(/\.[^.]+$/, '')}-web-${Date.now()}`));
  await mkdir(output, { recursive: false }); // Never overwrite an existing bundle.
  const renditions = [];
  for (const r of ladder.renditions) {
    const { label: name } = r;
    await mkdir(join(output, name));
    console.log(`${name} 변환 중 (${renditions.length + 1}/${ladder.renditions.length})`);
    const hasAudio = probe.streams.some(s => s.codec_type === 'audio');
    const args = hlsEncodeArgs(input, r, { preset: 'fast', hdr, hasAudio }).map(a => a.startsWith(`${name}/`) ? join(output, a) : a);
    await ffmpeg(args);
    renditions.push(toManifestRendition(r));
  }
  const fallback = toManifestRendition(ladder.fallback);
  console.log('미리보기와 호환 영상 생성 중');
  await ffmpeg(fallbackArgs(join(output, fallback.playlist)).map(a => a === 'fallback.mp4' ? join(output, a) : a));
  await ffmpeg(posterArgs(join(output, fallback.playlist)).map(a => a === 'poster.jpg' ? join(output, a) : a));
  await writeFile(join(output, 'master.m3u8'), buildMasterPlaylist(ladder.renditions));
  const files = [], bytes = {};
  for (const name of await readdir(output, { recursive: true })) {
    const full = join(output, name); if (!(await stat(full)).isFile()) continue;
    const path = name.replaceAll('\\', '/'); const data = await readFile(full);
    files.push({ path, size: data.length }); bytes[path] = new Uint8Array(data);
  }
  const manifest = parseVideoManifest({ version: 1, duration, master: 'master.m3u8', fallback: 'fallback.mp4', poster: 'poster.jpg', renditions, files });
  for (const f of files.filter(f => f.path.endsWith('.m3u8'))) validateVideoPlaylist(f.path, new TextDecoder().decode(bytes[f.path]), manifest);
  bytes['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  await writeFile(join(output, 'manifest.json'), bytes['manifest.json']);
  await writeFile(`${output}.zip`, zipSync(bytes, { level: 0 }));
  console.log(`완료: ${output}.zip (${(files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(1)} MB)`);
  return { output, manifest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) { console.error('사용법: node scripts/convert-video.mjs 원본영상 [새출력폴더]'); process.exitCode = 1; }
  else await convertVideo(process.argv[2], process.argv[3]).catch(e => { console.error(e.message); process.exitCode = 1; });
}
