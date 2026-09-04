import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPanelPrompts } from './render-panels.mjs';

/**
 * Codex 내장 image_gen으로 패널을 생성한다. 호출 경로 진단: references/conti-panel-spec.md
 *
 * CODEX_ARGS — 이 두 오버라이드가 없으면 CLI 0.128.0이 앱 config(service_tier=priority,
 * model=gpt-5.6-sol)를 소화하지 못해 빈 출력 또는 400으로 죽는다 (2026-09-03 실측).
 * 바뀌면 여기 한 곳만 고친다.
 */
export const CODEX_ARGS = ['exec', '-c', 'service_tier=fast', '-c', 'model=gpt-5.5', '--skip-git-repo-check'];
export const INSTRUCTION_FILE = 'panel-instruction.txt';

/** 세션 1회로 전 패널을 만든다 — 패널마다 세션을 띄우면 분 단위로 낭비된다. */
export function buildPanelInstruction(jobs) {
  return [
    'Use the imagegen skill with the built-in image_gen tool (do NOT use the CLI fallback, do NOT ask for OPENAI_API_KEY).',
    `Generate ${jobs.length} storyboard panel images, one image_gen call per panel, each in VERTICAL PORTRAIT orientation (clearly taller than wide, 9:16).`,
    'After each generation, copy the produced PNG from $CODEX_HOME/generated_images into the current working directory at the exact relative path given below (create the panels/ folder if missing).',
    'Do not create, modify, or delete any other file. Never add text or lettering to the images.',
    '',
    ...jobs.flatMap((j) => [`### ${j.file}`, j.prompt, '']),
    'When every file listed above exists, reply with the list of written paths and nothing else.',
  ].join('\n');
}

export function defaultRunner(args, cwd, timeoutMs) {
  // 문자열 한 줄로 넘긴다 — shell:true + 배열 인자는 DEP0190 경고를 낸다. 인자는 우리가 만든 고정 토큰과
  // JSON.stringify로 감싼 프롬프트뿐이라 공백 결합이 안전하다.
  const r = spawnSync(['codex', ...args].join(' '), {
    cwd,
    shell: true, // Windows에서 codex.cmd 실행에 필요
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}

export function generatePanels(dir, sb, { force = false, timeoutMs = 600_000, runner = defaultRunner } = {}) {
  const all = renderPanelPrompts(sb);
  const jobs = force ? all : all.filter((j) => !existsSync(join(dir, j.file)));
  const skipped = all.filter((j) => !jobs.includes(j)).map((j) => j.file);
  if (!jobs.length) return { ran: false, generated: [], skipped, missing: [] };

  mkdirSync(join(dir, 'panels'), { recursive: true });
  writeFileSync(join(dir, INSTRUCTION_FILE), buildPanelInstruction(jobs), 'utf8');
  // 프롬프트를 인자로 넘기지 않고 파일로 읽게 한다 — 셸 인용 문제를 피한다
  const prompt = `Read ${INSTRUCTION_FILE} in the current working directory and follow it exactly.`;
  const res = runner([...CODEX_ARGS, JSON.stringify(prompt)], dir, timeoutMs);

  const generated = jobs.filter((j) => existsSync(join(dir, j.file))).map((j) => j.file);
  const missing = jobs.filter((j) => !existsSync(join(dir, j.file))).map((j) => j.file);
  return {
    ran: true,
    generated,
    skipped,
    missing,
    status: res.status ?? null,
    error: res.error?.message ?? null,
    stderrTail: String(res.stderr ?? '').slice(-2000),
  };
}
