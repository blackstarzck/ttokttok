import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStoryboardMd } from './render-md.mjs';
import { validateStoryboard } from './validate.mjs';

const here = new URL('.', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', here), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../references/evidence.json', here), 'utf8'));
const md = renderStoryboardMd(fixture, validateStoryboard(fixture, evidence), evidence);

test('제목·선택 컨셉·근거 표', () => {
  assert.ok(md.startsWith('# 변신 — 15초 쇼츠 스토리보드'));
  assert.ok(md.includes('## 컨셉 A · curiosity-gap × unsettling × ink-line-art'));
  assert.ok(md.includes('| A-2 | A |'));
  assert.ok(md.includes('Loewenstein'));
});

test('기각안 2개가 한 줄씩', () => {
  assert.ok(md.includes('- **B** pattern-interrupt × deadpan-humor'));
  assert.ok(md.includes('- **C** bold-claim × awe'));
});

test('타임라인 표: 샷·구간·카메라·내레이션', () => {
  assert.ok(md.includes('| 1 | 00:00.000–00:03.000 |'));
  assert.ok(md.includes('The camera pushes in with small amplitude at slow speed toward his wide-open eyes'));
  assert.ok(md.includes('아침에 눈을 떴는데'));
});

test('자막 큐 표와 음절 메트릭', () => {
  assert.ok(md.includes('| 0:00:03.20 | 0:00:05.80 | 몸이 벌레로 변해 / 있었다 |'));
  assert.ok(md.includes('49음절'));
});

test('no_subtitle 큐는 표에 이유가 남는다', () => {
  const sb = structuredClone(fixture);
  sb.narration.at(-1).no_subtitle = true;
  const out = renderStoryboardMd(sb, validateStoryboard(sb, evidence), evidence);
  assert.ok(out.includes('카프카, 변신 _(음성만 — 제목 카드가 표시)_'));
});

test('제작 절차와 파일 목록', () => {
  assert.ok(md.includes('h3-prompt.txt'));
  assert.ok(md.includes('burn.ps1'));
  assert.ok(md.includes('input.mp4'));
});
