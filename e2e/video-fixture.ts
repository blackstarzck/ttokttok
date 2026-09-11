import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseVideoManifest } from '@ttokttok/shared/video-bundle';

export function hlsFixture() {
  const directory = '.tmp/test-assets/hls-e2e-quality';
  if (!existsSync(`${directory}.zip`)) {
    mkdirSync('.tmp/test-assets', { recursive: true });
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      'testsrc2=size=1080x1920:rate=30:duration=36', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '.tmp/test-assets/hls-source.mp4'], { windowsHide: true });
    execFileSync(process.execPath, ['scripts/convert-video.mjs', '.tmp/test-assets/hls-source.mp4', directory], { windowsHide: true, timeout: 180000 });
  }
  const manifest = parseVideoManifest(JSON.parse(readFileSync(`${directory}/manifest.json`, 'utf8')));
  return { directory, manifest, zip: resolve(`${directory}.zip`) };
}
