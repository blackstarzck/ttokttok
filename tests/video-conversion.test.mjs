import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { convertVideo } from '../scripts/convert-video.mjs';

const root = resolve('.tmp', `conversion-check-${Date.now()}`);
await mkdir(root, { recursive: true });
function ff(args) { execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true }); }
function probe(file) { return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { windowsHide: true, encoding: 'utf8' })); }

test('conversion keeps small landscape dimensions and audio; never upscales', async () => {
  const source = join(root, 'landscape.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', source]);
  const { output, manifest } = await convertVideo(source, join(root, 'landscape'));
  assert.deepEqual(manifest.renditions.map(r => [r.width, r.height]), [[480, 270]]);
  const streams = probe(join(output, 'fallback.mp4')).streams;
  assert.equal(streams.find(s => s.codec_type === 'audio').codec_name, 'aac');
  assert.equal(streams.find(s => s.codec_type === 'video').pix_fmt, 'yuv420p');
  assert.match(await readFile(join(output, '270p/index.m3u8'), 'utf8'), /#EXTINF:2\.000/);
});

test('conversion applies rotation metadata and handles silent square footage', async () => {
  const base = join(root, 'base.mp4'), rotated = join(root, 'rotated.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30:duration=2', '-c:v', 'libx264', base]);
  ff(['-display_rotation', '90', '-i', base, '-c', 'copy', rotated]);
  const result = await convertVideo(rotated, join(root, 'rotated'));
  assert.deepEqual(result.manifest.renditions.map(r => [r.width, r.height]), [[270, 480]]);
  assert.equal(probe(join(result.output, 'fallback.mp4')).streams.length, 1);
  const square = join(root, 'square.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=720x720:rate=30:duration=2', '-c:v', 'libx264', square]);
  const squared = await convertVideo(square, join(root, 'square'));
  assert.deepEqual(squared.manifest.renditions.map(r => [r.width, r.height]), [[480, 480], [720, 720]]);
});

test('HDR conversion produces SDR playback and aligned 2-second variants', async () => {
  const source = join(root, 'hdr.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=4', '-pix_fmt', 'yuv420p10le', '-c:v', 'libx264', '-x264-params', 'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc', source]);
  assert.equal(probe(source).streams[0].color_transfer, 'smpte2084');
  const result = await convertVideo(source, join(root, 'hdr'));
  const v = probe(join(result.output, 'fallback.mp4')).streams[0];
  assert.equal(v.pix_fmt, 'yuv420p');
  assert.equal(v.color_transfer, 'bt709');
  for (const rendition of result.manifest.renditions) {
    const playlist = await readFile(join(result.output, rendition.playlist), 'utf8');
    assert.equal((playlist.match(/#EXTINF:2\.000/g) ?? []).length, 2);
    const packets = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=flags', '-of', 'json', join(result.output, rendition.label, 'segment_0001.ts')], { encoding: 'utf8', windowsHide: true }));
    assert.match(packets.packets[0].flags, /K/);
  }
});

test('static clips do not consume the full motion-video bitrate budget', async () => {
  const source = join(root, 'static.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=black:size=720x1280:rate=30:duration=4', '-c:v', 'libx264', source]);
  const result = await convertVideo(source, join(root, 'static'));
  assert.ok(result.manifest.files.find(f => f.path === 'fallback.mp4').size < 100000);
});
