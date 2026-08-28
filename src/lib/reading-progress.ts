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

/**
 * 서버 저장 — 로그인 사용자만 (PRD §5.4 "기기 간 동기화").
 * RLS와 DB 기본값(auth.uid())이 소유자를 정하므로 여기서 다루지 않는다.
 */
export async function syncProgressToServer(
  bookId: string,
  cfi: string,
  percent: number,
): Promise<void> {
  const { createClient } = await import("@/lib/supabase/client");
  const { error } = await createClient().from("reading_progress").upsert(
    {
      book_id: bookId,
      epub_cfi: cfi,
      percent,
      // 100%에 닿으면 완독 처리 (PRD §5.4).
      ...(percent >= 100 ? { completed_at: new Date().toISOString() } : {}),
    },
    { onConflict: "user_id,book_id" },
  );
  if (error) console.error("progress sync:", error.message);
}

/**
 * 로그인 시점의 게스트 기록 병합 (PRD §5.4).
 * 서버에 이미 더 많이 읽은 기록이 있으면 덮어쓰지 않는다.
 */
export async function mergeGuestProgress(bookId: string): Promise<void> {
  const local = loadProgress(bookId);
  if (!local) return;

  const { createClient } = await import("@/lib/supabase/client");
  const db = createClient();

  const { data: remote } = await db
    .from("reading_progress")
    .select("percent")
    .eq("book_id", bookId)
    .maybeSingle();

  if (remote && Number(remote.percent) >= local.percent) return;
  await syncProgressToServer(bookId, local.cfi, local.percent);
}
