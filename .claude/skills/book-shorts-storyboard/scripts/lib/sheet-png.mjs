import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** 헤드리스 캡처용 브라우저 후보. 이 PC에는 Edge(x86 경로)와 Chrome이 있다. */
export const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

export function findBrowser(candidates = BROWSER_CANDIDATES) {
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** 시트 높이 = 헤더 200 + 패널 행 380씩 + 푸터 120 */
export function sheetHeight(panelCount) {
  return 200 + panelCount * 380 + 120;
}

export function captureSheetPng(htmlPath, pngPath, height, { browser = findBrowser(), runner = spawnSync } = {}) {
  if (!browser) return { ok: false, reason: 'no-browser' };
  const args = [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=3000',
    `--screenshot=${pngPath}`, `--window-size=1600,${height}`,
    pathToFileURL(htmlPath).href,
  ];
  const r = runner(browser, args, { encoding: 'utf8', timeout: 60_000, stdio: 'pipe' });
  if (existsSync(pngPath)) return { ok: true, browser };
  return { ok: false, reason: 'no-output', status: r.status ?? null, stderr: String(r.stderr ?? '').slice(-1000) };
}
