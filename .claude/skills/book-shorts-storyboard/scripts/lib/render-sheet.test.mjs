import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderContiSheet } from './render-sheet.mjs';
import { sheetHeight, findBrowser } from './sheet-png.mjs';

const here = new URL('.', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', here), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../references/evidence.json', here), 'utf8'));
const template = readFileSync(new URL('../../templates/contisheet.html', here), 'utf8');

test('헤더 토큰이 치환된다', () => {
  const html = renderContiSheet(fixture, template, { evidence });
  assert.ok(html.includes('<h1>변신<small>프란츠 카프카</small></h1>'));
  assert.ok(html.includes('curiosity-gap'));
  assert.ok(html.includes('15초 · 9:16 · 패널 5'));
  assert.ok(!html.includes('{{'));
});

test('패널 행: VIDEO 노트·이미지 또는 플레이스홀더·AUDIO 노트', () => {
  const html = renderContiSheet(fixture, template, { evidence, panelExists: (f) => f === 'panels/panel-01.png' });
  assert.ok(html.includes('<img src="panels/panel-01.png"'));
  assert.ok(!html.includes('<img src="panels/panel-02.png"'));
  assert.ok(html.includes('panel-02'));                       // 플레이스홀더에 이름
  assert.ok(html.includes('Extreme close-up of the man'));    // 플레이스홀더에 프롬프트
  assert.ok(html.includes('Shot 1 · 00:00.000–00:03.000'));
  assert.ok(html.includes('어두운 방, 침대에 누운 그레고르'));
  assert.ok(html.includes('<p>NA) 아침에 눈을 떴는데</p>'));
  assert.ok(html.includes('<p>S.E) 알람 시계 초침 소리</p>'));
});

test('HTML 이스케이프', () => {
  const sb = structuredClone(fixture);
  sb.panels[0].video_note_ko = '<b>굵게</b> & 기호';
  const html = renderContiSheet(sb, template, { evidence });
  assert.ok(html.includes('&lt;b&gt;굵게&lt;/b&gt; &amp; 기호'));
});

test('푸터에 선택 컨셉 근거가 등급과 함께', () => {
  const html = renderContiSheet(fixture, template, { evidence });
  assert.ok(html.includes('A-2'));
  assert.ok(html.includes('[A]'));
  assert.ok(html.includes('Loewenstein'));
});

test('sheetHeight: 행 402(패널 356 + 패딩 44 + 경계 2) · 헤더 140 · 푸터 220', () => {
  // 실측(2026-09-04): 380/행 + 푸터 120으로는 5패널 시트 푸터의 두 번째 근거 줄이 잘렸다
  assert.equal(sheetHeight(5), 140 + 5 * 402 + 220);
  assert.equal(sheetHeight(4), 140 + 4 * 402 + 220);
});

test('findBrowser', () => {
  assert.equal(findBrowser(['Z:/nope.exe']), null);
});
