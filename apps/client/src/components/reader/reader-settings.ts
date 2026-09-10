/**
 * 뷰어 읽기 설정 (PRD §5.4: 글자 크기 조절, 밝기/테마).
 *
 * 앱 크롬은 다크 단일 테마지만(DESIGN.md), 읽는 면은 다르다 — 종이처럼
 * 취급되는 영역이고 사용자마다 눈이 편한 밝기가 다르다. 그래서 뷰어
 * 안에서만 세 가지 테마를 제공한다.
 */

export type ReaderTheme = "dark" | "sepia" | "light";

export const THEMES: {
  key: ReaderTheme;
  label: string;
  bg: string;
  fg: string;
}[] = [
  { key: "dark", label: "다크", bg: "#0f0f0f", fg: "#e6e6e6" },
  { key: "sepia", label: "세피아", bg: "#f4ecd8", fg: "#4a3f30" },
  { key: "light", label: "라이트", bg: "#ffffff", fg: "#1a1a1a" },
];

export const FONT_SIZES = [90, 100, 115, 130, 150] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export type ReaderPrefs = { theme: ReaderTheme; fontSize: FontSize };

export const DEFAULT_PREFS: ReaderPrefs = { theme: "dark", fontSize: 115 };

const KEY = "ttokttok.reader-prefs";

export function loadPrefs(): ReaderPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      theme: THEMES.some((t) => t.key === parsed.theme)
        ? parsed.theme!
        : DEFAULT_PREFS.theme,
      fontSize: FONT_SIZES.includes(parsed.fontSize as FontSize)
        ? (parsed.fontSize as FontSize)
        : DEFAULT_PREFS.fontSize,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: ReaderPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 저장 못 해도 이번 세션 동안은 적용된다.
  }
}
