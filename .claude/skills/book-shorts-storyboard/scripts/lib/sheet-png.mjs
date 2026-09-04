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

/**
 * 시트 높이 = 헤더 140 + 패널 행 402씩 + 푸터 220.
 * 행 402 = 200px 폭 9:16 패널 356 + 상하 패딩 44 + 경계 2. 푸터 220은 근거 4줄까지.
 * 실측(2026-09-04): 380/행·푸터 120은 5패널 시트의 두 번째 근거 줄을 잘랐다.
 * 남는 아래 여백은 템플릿의 .sheet { min-height: 100vh }가 흰색으로 채운다.
 */
export function sheetHeight(panelCount) {
  return 140 + panelCount * 402 + 220;
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
