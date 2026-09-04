import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAss } from './render-ass.mjs';
import { renderBurnPs1 } from './render-burn.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const ass = renderAss(fixture);

test('헤더: PlayRes 1440×2560', () => {
  assert.ok(ass.startsWith('[Script Info]'));
  assert.ok(ass.includes('PlayResX: 1440'));
  assert.ok(ass.includes('PlayResY: 2560'));
});

test('스타일 2개: Sub(하단 중앙, 마진 288/384) · Title(정중앙)', () => {
  assert.ok(ass.includes('Style: Sub,Malgun Gothic,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,0,2,288,288,384,1'));
  assert.ok(ass.includes('Style: Title,Malgun Gothic,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,0,5,288,288,0,1'));
});

test('큐 → Dialogue, 12자 줄바꿈은 \\N', () => {
  assert.ok(ass.includes('Dialogue: 0,0:00:00.40,0:00:02.80,Sub,,0,0,0,,아침에 눈을 떴는데'));
  assert.ok(ass.includes('Dialogue: 0,0:00:03.20,0:00:05.80,Sub,,0,0,0,,몸이 벌레로 변해\\N있었다'));
});

test('제목 카드: Title 스타일, at부터 끝까지', () => {
  assert.ok(ass.includes('Dialogue: 0,0:00:12.50,0:00:15.00,Title,,0,0,0,,변신 · 프란츠 카프카'));
});

test('no_subtitle 큐는 자막에서 빠진다 — 말은 하되 화면에는 안 뜬다', () => {
  // 제목을 마지막 큐에서 말하면서 제목 카드도 띄우면 같은 글자가 두 번 겹친다
  const sb = structuredClone(fixture);
  sb.narration.at(-1).no_subtitle = true;
  const out = renderAss(sb);
  assert.ok(!out.includes(',Sub,,0,0,0,,카프카, 변신'));
  assert.ok(out.includes(',Title,,0,0,0,,변신 · 프란츠 카프카')); // 제목 카드는 남는다
  assert.equal(out.split('\n').filter((l) => l.includes(',Sub,')).length, fixture.narration.length - 1);
});

test('큐는 start 순으로 정렬된다', () => {
  const sb = structuredClone(fixture);
  sb.narration.reverse();
  const lines = renderAss(sb).split('\n').filter((l) => l.includes(',Sub,'));
  assert.ok(lines[0].includes('0:00:00.40'));
});

test('중괄호는 이스케이프', () => {
  const sb = structuredClone(fixture);
  sb.narration[0].text_ko = '가나{다}';
  assert.ok(renderAss(sb).includes('가나\\{다\\}'));
});

test('burn.ps1: 상대 경로 ass 필터, ffmpeg·입력 파일 검사', () => {
  const ps = renderBurnPs1();
  assert.ok(ps.includes('Set-Location $PSScriptRoot'));
  assert.ok(ps.includes('-vf "ass=subtitles.ass"'));
  assert.ok(ps.includes('Get-Command ffmpeg'));
  assert.ok(ps.includes('Test-Path $In'));
  assert.ok(ps.includes('-c:a copy'));
});
