import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { parseVideoManifest, validateVideoPlaylist } from '../packages/shared/src/video-bundle.ts';

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
  const short = Math.min(width, height);
  const levels = [480, 720, 1080].filter(n => n <= short);
  if (!levels.length) levels.push(Math.floor(short / 2) * 2);
  const hdr = ['smpte2084', 'arib-std-b67'].includes(v.color_transfer);
  const prefix = hdr ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,' : '';
  output = resolve(output || join(dirname(input), `${basename(input).replace(/\.[^.]+$/, '')}-web-${Date.now()}`));
  await mkdir(output, { recursive: false }); // Never overwrite an existing bundle.
  const renditions = [];
  for (const level of levels) {
    const w = Math.max(2, Math.floor(width * level / short / 2) * 2);
    const h = Math.max(2, Math.floor(height * level / short / 2) * 2);
    const rate = level <= 480 ? 800 : level <= 720 ? 1600 : 3000;
    const name = `${level}p`; await mkdir(join(output, name));
    console.log(`${name} 변환 중 (${renditions.length + 1}/${levels.length})`);
    // Constrained quality encoding: static book/text clips should not fill a fixed bitrate budget.
    const codec = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-maxrate', `${Math.round(rate * 1.15)}k`, '-bufsize', `${rate * 2}k`, '-pix_fmt', 'yuv420p', ...(hdr ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'] : []), '-r', '30', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-c:a', 'aac', '-b:a', '96k', '-ac', '2'];
    await ffmpeg(['-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `${prefix}scale=${w}:${h},setsar=1`, ...codec, '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments', '-hls_segment_filename', join(output, name, 'segment_%04d.ts'), join(output, name, 'index.m3u8')]);
    renditions.push({ label: name, width: w, height: h, bandwidth: Math.round((rate * 1.15 + 96) * 1000), playlist: `${name}/index.m3u8` });
  }
  const fallback = [...renditions].reverse().find(r => Math.min(r.width, r.height) <= 720) || renditions[0];
  console.log('미리보기와 호환 영상 생성 중');
  await ffmpeg(['-i', join(output, fallback.playlist), '-c', 'copy', '-movflags', '+faststart', join(output, 'fallback.mp4')]);
  await ffmpeg(['-i', join(output, fallback.playlist), '-frames:v', '1', '-q:v', '3', join(output, 'poster.jpg')]);
  await writeFile(join(output, 'master.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n' + renditions.map(r => `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}\n${r.playlist}\n`).join(''));
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
