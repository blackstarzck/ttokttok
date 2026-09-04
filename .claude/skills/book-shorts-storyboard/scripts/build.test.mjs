import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./build-storyboard.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/kafka-metamorphosis.json', import.meta.url));
const run = (dir, ...flags) => spawnSync(process.execPath, [entry, dir, ...flags], { encoding: 'utf8' });
const OUTPUTS = ['build-report.json', 'storyboard.md', 'h3-prompt.txt', 'panel-prompts.txt', 'subtitles.ass', 'burn.ps1', 'contisheet.html'];
const hasBom = (buf) => buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;

test('픽스처 빌드: 전 산출물 생성, exit 0, BOM', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  copyFileSync(fixture, join(dir, 'storyboard.json'));
  const r = run(dir, '--no-png');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of OUTPUTS) assert.ok(existsSync(join(dir, f)), f);
  const report = JSON.parse(readFileSync(join(dir, 'build-report.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.ok(report.metrics.promptChars > 0 && report.metrics.promptChars <= 7000);
  assert.ok(hasBom(readFileSync(join(dir, 'subtitles.ass'))));
  assert.ok(hasBom(readFileSync(join(dir, 'burn.ps1'))));
  assert.ok(!hasBom(readFileSync(join(dir, 'h3-prompt.txt'))));
  assert.ok(r.stdout.includes('검증 통과'));
  assert.ok(readFileSync(join(dir, 'contisheet.html'), 'utf8').includes('panel-01')); // 플레이스홀더
});

test('검증 실패: 리포트만 쓰고 exit 1, 다른 산출물은 만들지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  const sb = JSON.parse(readFileSync(fixture, 'utf8'));
  sb.shots = [sb.shots[0]];
  writeFileSync(join(dir, 'storyboard.json'), JSON.stringify(sb));
  const r = run(dir, '--no-png');
  assert.equal(r.status, 1);
  assert.ok(existsSync(join(dir, 'build-report.json')));
  assert.ok(!existsSync(join(dir, 'h3-prompt.txt')));
  assert.ok(r.stderr.includes('V1'));
});

test('JSON 파싱 실패 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  writeFileSync(join(dir, 'storyboard.json'), '{ not json');
  const r = run(dir);
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('JSON'));
});

test('storyboard.json 없음 → exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sb-'));
  assert.equal(run(dir).status, 2);
});

test('인자 없음 → exit 2 + 사용법', () => {
  const r = spawnSync(process.execPath, [entry], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes('사용:'));
});
