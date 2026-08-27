/**
 * 게스트 독서 진행률 (PRD §5.4).
 *
 * 로그인 사용자는 reading_progress 테이블에 저장해 기기 간 동기화하지만,
 * 인증은 Phase 2다. 그때까지는 localStorage에만 남기고, 로그인 기능이
 * 붙으면 이 값을 서버로 병합한다.
 */

const KEY = "ttokttok.progress";

export type LocalProgress = {
  cfi: string;
  percent: number;
  updatedAt: number;
};

type Store = Record<string, LocalProgress>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    return {};
  }
}

export function loadProgress(bookId: string): LocalProgress | null {
  return read()[bookId] ?? null;
}

export function saveProgress(
  bookId: string,
  cfi: string,
  percent: number,
): void {
  try {
    const store = read();
    store[bookId] = { cfi, percent, updatedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 프라이빗 모드 등 — 진행률만 못 남길 뿐 읽기는 계속된다.
  }
}
