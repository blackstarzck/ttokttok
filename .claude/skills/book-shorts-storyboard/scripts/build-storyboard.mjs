#!/usr/bin/env node
/**
 * storyboard.json → 전 산출물.
 *   node build-storyboard.mjs <dir> [--panels] [--force-panels] [--no-png]
 * exit 0 성공 (패널·PNG 실패는 경고) · 1 검증 실패 · 2 사용법/파싱 오류
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStoryboard } from './lib/validate.mjs';
import { renderH3Prompt } from './lib/render-h3.mjs';
import { renderPanelPromptsText } from './lib/render-panels.mjs';
import { renderAss } from './lib/render-ass.mjs';
import { renderBurnPs1 } from './lib/render-burn.mjs';
import { renderStoryboardMd } from './lib/render-md.mjs';
import { renderContiSheet } from './lib/render-sheet.mjs';
import { generatePanels } from './lib/codex-panels.mjs';
import { captureSheetPng, sheetHeight } from './lib/sheet-png.mjs';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOM = String.fromCharCode(0xfeff); // UTF-8 BOM

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const dirArg = args.find((a) => !a.startsWith('--'));

if (!dirArg) {
  console.error('사용: node build-storyboard.mjs <출력 디렉터리> [--panels] [--force-panels] [--no-png]');
  console.error('  <출력 디렉터리>/storyboard.json 을 읽어 산출물을 같은 폴더에 쓴다.');
  process.exit(2);
}

const dir = resolve(dirArg);
const sbPath = join(dir, 'storyboard.json');
if (!existsSync(sbPath)) {
  console.error(`storyboard.json 없음: ${sbPath}`);
  process.exit(2);
}

let sb;
try {
  sb = JSON.parse(readFileSync(sbPath, 'utf8'));
} catch (e) {
  console.error(`storyboard.json JSON 파싱 실패: ${e.message}`);
  process.exit(2);
}

const evidence = JSON.parse(readFileSync(join(SKILL_ROOT, 'references', 'evidence.json'), 'utf8'));
const template = readFileSync(join(SKILL_ROOT, 'templates', 'contisheet.html'), 'utf8');
const write = (name, text, { bom = false } = {}) => writeFileSync(join(dir, name), (bom ? BOM : '') + text, 'utf8');

// 1. 검증 — 실패하면 리포트만 남기고 중단 (반쪽 산출물을 남기지 않는다)
const report = validateStoryboard(sb, evidence, { renderPrompt: renderH3Prompt });
if (!report.ok) {
  write('build-report.json', JSON.stringify(report, null, 2));
  console.error(`검증 실패 (${report.errors.length}건):`);
  for (const e of report.errors) console.error(`  [${e.rule}] ${e.message}`);
  for (const w of report.warnings) console.error(`  (경고 ${w.rule}) ${w.message}`);
  process.exit(1);
}

// 2. 텍스트 산출물
write('h3-prompt.txt', renderH3Prompt(sb));
write('panel-prompts.txt', renderPanelPromptsText(sb));
write('subtitles.ass', renderAss(sb), { bom: true });
write('burn.ps1', renderBurnPs1(), { bom: true });

// 3. 패널 (선택) — codex exec 1회
if (flags.has('--panels')) {
  console.log('콘티 패널 생성 중 (codex exec, 수 분 소요)…');
  report.panels = generatePanels(dir, sb, { force: flags.has('--force-panels') });
  const p = report.panels;
  if (p.ran) console.log(`  생성 ${p.generated.length} · 건너뜀 ${p.skipped.length} · 누락 ${p.missing.length}${p.error ? ` · 오류: ${p.error}` : ''}`);
  else console.log(`  전 패널 이미 존재 (건너뜀 ${p.skipped.length}). 다시 만들려면 --force-panels`);
  if (p.missing.length) report.warnings.push({ rule: 'PANELS', message: `누락 패널: ${p.missing.join(', ')} — 시트는 플레이스홀더로 채움` });
}

// 4. 콘티 시트
const panelExists = (file) => existsSync(join(dir, file));
write('contisheet.html', renderContiSheet(sb, template, { panelExists, evidence }));
if (!flags.has('--no-png')) {
  const png = captureSheetPng(join(dir, 'contisheet.html'), join(dir, 'contisheet.png'), sheetHeight(sb.panels.length));
  report.sheetPng = png;
  if (!png.ok) report.warnings.push({ rule: 'SHEET_PNG', message: `contisheet.png 생략 (${png.reason}) — contisheet.html을 브라우저로 열어 확인` });
}

// 5. 기획서 + 리포트
write('storyboard.md', renderStoryboardMd(sb, report, evidence));
write('build-report.json', JSON.stringify(report, null, 2));

console.log(`검증 통과 · 내레이션 ${report.metrics.syllables}음절 · 큐 ${report.metrics.cues} · 샷 ${report.metrics.shots} · 패널 ${report.metrics.panels} · 프롬프트 ${report.metrics.promptChars}자`);
for (const w of report.warnings) console.log(`  (경고 ${w.rule}) ${w.message}`);
console.log(`산출물: ${dir}`);
