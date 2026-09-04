import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CODEX_ARGS, INSTRUCTION_FILE, buildPanelInstruction, generatePanels } from './codex-panels.mjs';
import { renderPanelPrompts } from './render-panels.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/kafka-metamorphosis.json', import.meta.url), 'utf8'));
const tmp = () => mkdtempSync(join(tmpdir(), 'panels-'));

test('CODEX_ARGS는 우회 플래그 두 개를 포함한다', () => {
  assert.deepEqual(CODEX_ARGS, ['exec', '-c', 'service_tier=fast', '-c', 'model=gpt-5.5', '--skip-git-repo-check']);
});

test('지시문: 내장 image_gen·세로·패널별 파일 경로·프롬프트', () => {
  const jobs = renderPanelPrompts(fixture);
  const s = buildPanelInstruction(jobs);
  assert.ok(s.includes('built-in image_gen'));
  assert.ok(s.includes('VERTICAL PORTRAIT'));
  for (const j of jobs) {
    assert.ok(s.includes(`### ${j.file}`));
    assert.ok(s.includes(j.prompt));
  }
});

test('generatePanels: 지시문 파일을 쓰고 runner를 cwd=dir로 호출, 생성/누락을 보고', () => {
  const dir = tmp();
  const calls = [];
  const runner = (args, cwd) => {
    calls.push({ args, cwd });
    // 가짜: 1,2번만 만든다
    mkdirSync(join(cwd, 'panels'), { recursive: true });
    writeFileSync(join(cwd, 'panels/panel-01.png'), 'x');
    writeFileSync(join(cwd, 'panels/panel-02.png'), 'x');
    return { status: 0, stdout: '', stderr: '' };
  };
  const r = generatePanels(dir, fixture, { runner });
  assert.equal(r.ran, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cwd, dir);
  assert.deepEqual(calls[0].args.slice(0, CODEX_ARGS.length), CODEX_ARGS);
  assert.ok(calls[0].args.at(-1).includes(INSTRUCTION_FILE));
  assert.ok(existsSync(join(dir, INSTRUCTION_FILE)));
  assert.deepEqual(r.generated, ['panels/panel-01.png', 'panels/panel-02.png']);
  assert.deepEqual(r.missing, ['panels/panel-03.png', 'panels/panel-04.png', 'panels/panel-05.png']);
});

test('generatePanels: 이미 있는 패널은 건너뛴다, force면 다시', () => {
  const dir = tmp();
  mkdirSync(join(dir, 'panels'));
  for (const n of ['01', '02', '03', '04', '05']) writeFileSync(join(dir, `panels/panel-${n}.png`), 'x');
  let called = 0;
  const runner = () => { called++; return { status: 0, stdout: '', stderr: '' }; };
  const r = generatePanels(dir, fixture, { runner });
  assert.equal(r.ran, false);
  assert.equal(called, 0);
  assert.equal(r.skipped.length, 5);
  const f = generatePanels(dir, fixture, { runner, force: true });
  assert.equal(f.ran, true);
  assert.equal(called, 1);
});

test('generatePanels: runner 에러를 보고한다', () => {
  const dir = tmp();
  const runner = () => ({ status: null, stdout: '', stderr: 'boom', error: new Error('ENOENT codex') });
  const r = generatePanels(dir, fixture, { runner });
  assert.equal(r.error, 'ENOENT codex');
  assert.equal(r.missing.length, 5);
});
