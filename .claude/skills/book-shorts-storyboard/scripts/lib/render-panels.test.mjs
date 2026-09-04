import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelFileName, renderPanelPrompt, renderPanelPrompts, renderPanelPromptsText } from './render-panels.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));

test('파일명 규칙', () => {
  assert.equal(panelFileName('01'), 'panels/panel-01.png');
});

test('모든 패널 프롬프트에 style_lock·character_sheet·세로·텍스트 금지가 들어간다', () => {
  const jobs = renderPanelPrompts(fixture);
  assert.equal(jobs.length, 5);
  for (const j of jobs) {
    assert.ok(j.prompt.includes(fixture.style_lock), j.id);
    assert.ok(j.prompt.includes(`Character: ${fixture.character_sheet}`), j.id);
    assert.ok(j.prompt.includes('Vertical 9:16 portrait composition'), j.id);
    assert.ok(j.prompt.includes('No text, no lettering'), j.id);
  }
});

test('샷 타입이 문장 선두에 온다', () => {
  const p = renderPanelPrompt(fixture, fixture.panels[0]);
  assert.ok(p.startsWith('Medium close-up of a gaunt man lying in bed'));
});

test('character_sheet가 비면 Character 절 생략', () => {
  const sb = structuredClone(fixture);
  sb.character_sheet = '';
  assert.ok(!renderPanelPrompt(sb, sb.panels[0]).includes('Character:'));
});

test('텍스트 묶음은 파일명 헤더 + 프롬프트', () => {
  const t = renderPanelPromptsText(fixture);
  assert.ok(t.includes('## panels/panel-01.png'));
  assert.ok(t.includes('## panels/panel-05.png'));
});
