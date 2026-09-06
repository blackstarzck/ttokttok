"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Book, Rendition } from "epubjs";
import { ChevronLeft, List, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReaderToc, type TocItem } from "@/components/reader/reader-toc";
import { ReaderPrefsSheet } from "@/components/reader/reader-prefs-sheet";
import {
  DEFAULT_PREFS,
  THEMES,
  loadPrefs,
  savePrefs,
  type ReaderPrefs,
} from "@/components/reader/reader-settings";
import {
  loadProgress,
  forgetProgress,
  mergeGuestProgress,
  saveProgress,
  syncProgressToServer,
} from "@/lib/reading-progress";
import { track } from "@/lib/analytics";
import type { ReaderBook } from "@/lib/book";

/** 좌우 끝 이 비율만큼은 페이지 넘김 영역, 가운데는 UI 토글. */
const TAP_EDGE = 0.3;

/**
 * 이 시간이 지나도 첫 페이지가 안 뜨면 실패로 본다.
 * epub.js는 내부 큐가 막혀도 오류를 내지 않고 조용히 멈춘다 —
 * 그대로 두면 "책을 여는 중…"에 영원히 갇힌다.
 */
const OPEN_TIMEOUT_MS = 30_000;

/**
 * 저장된 위치가 살아 있으면 거기서, 아니면 처음부터 펼친다.
 *
 * 본문 파일을 교체하면(수급 파이프라인이 바뀌면) 예전 CFI가 사라진 구간을
 * 가리킬 수 있다. 그때 epub.js는 내부에서 비동기로 예외를 던지고 display()가
 * **끝내 완료되지 않는다** — 거부가 아니라 영영 대기라서 try/catch로는 못
 * 잡는다. 그래서 시간을 재고, 넘기면 그 위치를 버리고 첫 페이지로 간다.
 */
const RESTORE_TIMEOUT_MS = 5_000;

async function displaySaved(
  rendition: Rendition,
  cfi: string | undefined,
  onStale: () => void,
): Promise<void> {
  if (!cfi) {
    await rendition.display();
    return;
  }

  const restored = await Promise.race([
    rendition.display(cfi).then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), RESTORE_TIMEOUT_MS),
    ),
  ]);

  if (restored) return;

  onStale();
  await rendition.display();
}

export function Reader({
  book,
  isLoggedIn,
}: {
  book: ReaderBook;
  isLoggedIn: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState("");
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);

  /** 마지막으로 서버에 올린 퍼센트 — 같은 값을 반복해 쓰지 않는다. */
  const lastSyncedRef = useRef(-1);

  // ── epub.js 초기화 ────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let rendition: Rendition | null = null;
    let epub: Book | null = null;

    const timeout = setTimeout(() => {
      if (cancelled) return;
      console.error("EPUB 열기 시간 초과");
      setFailed(true);
      setLoading(false);
    }, OPEN_TIMEOUT_MS);

    (async () => {
      // epub.js는 window에 의존한다 — 서버 번들에 들어가지 않도록
      // 여기서만 동적으로 불러온다 (FRONTEND.md §6).
      const ePub = (await import("epubjs")).default;
      if (cancelled) return;

      // URL을 그대로 넘기지 않고 직접 받아 ArrayBuffer로 준다.
      // epub.js는 입력이 문자열이면 확장자로 종류를 판별하는데, signed
      // URL에는 `?token=…`이 붙어 이 판별이 취약하다. 직접 받으면
      // 만료(403) 같은 실패도 그 자리에서 분명한 오류로 잡을 수 있다.
      const res = await fetch(book.epubUrl);
      if (!res.ok) throw new Error(`EPUB 다운로드 실패 (HTTP ${res.status})`);
      const buffer = await res.arrayBuffer();
      if (cancelled) return;

      epub = ePub(buffer);
      bookRef.current = epub;

      rendition = epub.renderTo(host, {
        width: "100%",
        height: "100%",
        flow: "paginated",
        spread: "none",
        allowScriptedContent: false,
      });
      renditionRef.current = rendition;

      // 로그인 상태라면 게스트로 읽던 기록을 서버로 올린다.
      if (isLoggedIn) await mergeGuestProgress(book.id);

      const saved = loadProgress(book.id);
      await displaySaved(rendition, saved?.cfi, () => forgetProgress(book.id));

      if (cancelled) return;

      const nav = await epub.loaded.navigation;
      setToc(
        nav.toc.map((item) => ({ label: item.label.trim(), href: item.href })),
      );

      // 진행률(퍼센트)은 위치 색인이 있어야 계산된다. 무거우니 표시를
      // 막지 않고 뒤에서 생성한다.
      epub.locations.generate(1600).catch(() => {});

      clearTimeout(timeout);
      // 핵심 전환 지점 — 첫 페이지가 실제로 떴을 때만 센다 (PRD §7).
      void track("reader_open", { bookId: book.id });
      setLoading(false);
    })().catch((err) => {
      clearTimeout(timeout);
      console.error("EPUB 로드 실패:", err);
      if (!cancelled) {
        setFailed(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      rendition?.destroy();
      epub?.destroy();
      bookRef.current = null;
      renditionRef.current = null;
    };
  }, [book.epubUrl, book.id, isLoggedIn]);

  // ── 위치 변화 → 진행률 저장 ───────────────────────────────────
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || loading) return;

    function onRelocated(location: {
      start: { cfi: string; href: string };
    }) {
      const epub = bookRef.current;
      const cfi = location.start.cfi;

      let pct = 0;
      try {
        pct = Math.round((epub?.locations.percentageFromCfi(cfi) ?? 0) * 100);
      } catch {
        pct = 0;
      }
      setPercent(pct);
      saveProgress(book.id, cfi, pct);

      // 서버 쓰기는 페이지마다가 아니라 진행률이 실제로 움직였을 때만.
      // 한 페이지 넘길 때마다 왕복하면 읽는 흐름에 비해 과하다.
      if (pct !== lastSyncedRef.current) {
        const previous = lastSyncedRef.current;
        lastSyncedRef.current = pct;

        // 10% 단위로만 남긴다 — 페이지마다 남기면 원장이 진행률로 뒤덮인다.
        if (Math.floor(pct / 10) > Math.floor(Math.max(previous, 0) / 10)) {
          void track("reader_progress", { bookId: book.id, props: { percent: pct } });
        }
        if (pct >= 100 && previous < 100) {
          void track("book_complete", { bookId: book.id });
        }
        if (isLoggedIn) void syncProgressToServer(book.id, cfi, pct);
      }

      // 현재 챕터 이름 — 목차에서 href로 찾는다.
      const href = location.start.href;
      const hit = toc.find((t) => t.href.split("#")[0] === href.split("#")[0]);
      setLabel(hit?.label ?? "");
    }

    rendition.on("relocated", onRelocated);
    return () => {
      rendition.off("relocated", onRelocated);
    };
  }, [loading, book.id, toc, isLoggedIn]);

  // ── 읽기 설정 적용 ────────────────────────────────────────────
  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || loading) return;

    const theme = THEMES.find((t) => t.key === prefs.theme) ?? THEMES[0];
    rendition.themes.override("color", theme.fg);
    rendition.themes.override("background", theme.bg);
    rendition.themes.fontSize(`${prefs.fontSize}%`);
  }, [prefs, loading]);

  const updatePrefs = useCallback((next: ReaderPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  // ── 페이지 넘김 ───────────────────────────────────────────────
  const turn = useCallback((dir: "prev" | "next") => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    if (dir === "next") rendition.next();
    else rendition.prev();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") turn("next");
      else if (e.key === "ArrowLeft") turn("prev");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    const { left, width } = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - left) / width;
    if (x < TAP_EDGE) turn("prev");
    else if (x > 1 - TAP_EDGE) turn("next");
    else setChromeVisible((v) => !v);
  }

  const goTo = useCallback((href: string) => {
    renditionRef.current?.display(href);
  }, []);

  const theme = THEMES.find((t) => t.key === prefs.theme) ?? THEMES[0];

  return (
    <div
      className="relative flex h-dvh flex-col overflow-hidden"
      style={{ backgroundColor: theme.bg }}
    >
      {/* 상단 바 */}
      <header
        className={`absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2 py-2 transition-opacity duration-200 ${
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ backgroundColor: `${theme.bg}f2`, color: theme.fg }}
      >
        <Button asChild variant="ghost" size="icon-lg" className="min-h-11">
          <Link href="/" aria-label="피드로 돌아가기">
            <ChevronLeft aria-hidden />
          </Link>
        </Button>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{book.title}</span>
          <span className="truncate text-xs opacity-70">{book.author}</span>
        </div>

        <ReaderToc items={toc} onSelect={goTo}>
          <Button variant="ghost" size="icon-lg" className="min-h-11" aria-label="목차">
            <List aria-hidden />
          </Button>
        </ReaderToc>

        <ReaderPrefsSheet prefs={prefs} onChange={updatePrefs}>
          <Button variant="ghost" size="icon-lg" className="min-h-11" aria-label="읽기 설정">
            <Settings2 aria-hidden />
          </Button>
        </ReaderPrefsSheet>
      </header>

      {/* 본문 */}
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="h-full w-full" />

        {/* 탭 영역: epub.js가 iframe을 쓰므로 위에 투명 레이어를 덮는다 */}
        <div
          className="absolute inset-0 z-10"
          onClick={handleTap}
          role="presentation"
        />

        {loading ? (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center gap-2"
            style={{ backgroundColor: theme.bg, color: theme.fg }}
          >
            <Loader2 className="size-5 animate-spin" aria-hidden />
            <span className="text-sm">책을 여는 중…</span>
          </div>
        ) : null}

        {failed ? (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-6 text-center"
            style={{ backgroundColor: theme.bg, color: theme.fg }}
          >
            <p className="text-sm">책을 열지 못했어요.</p>
            <Button asChild variant="secondary" className="min-h-11">
              <Link href="/">피드로 돌아가기</Link>
            </Button>
          </div>
        ) : null}
      </div>

      {/* 하단 진행률 */}
      <footer
        className={`absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 px-4 py-3 transition-opacity duration-200 ${
          chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{
          backgroundColor: `${theme.bg}f2`,
          color: theme.fg,
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <span className="min-w-0 flex-1 truncate text-xs opacity-70">
          {label}
        </span>
        <div
          className="h-1 w-24 overflow-hidden rounded-full"
          style={{ backgroundColor: `${theme.fg}33` }}
        >
          <div
            className="h-full transition-[width] duration-200"
            style={{ width: `${percent}%`, backgroundColor: theme.fg }}
          />
        </div>
        <span className="text-xs tabular-nums opacity-70">{percent}%</span>
      </footer>
    </div>
  );
}
