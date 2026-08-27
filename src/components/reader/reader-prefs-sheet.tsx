"use client";

import { Minus, Plus } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FONT_SIZES,
  THEMES,
  type FontSize,
  type ReaderPrefs,
} from "@/components/reader/reader-settings";

/** 읽기 설정 시트 — 글자 크기와 테마 (PRD §5.4). */
export function ReaderPrefsSheet({
  prefs,
  onChange,
  children,
}: {
  prefs: ReaderPrefs;
  onChange: (next: ReaderPrefs) => void;
  children: React.ReactNode;
}) {
  const sizeIndex = FONT_SIZES.indexOf(prefs.fontSize);

  function stepSize(delta: number) {
    const next = FONT_SIZES[sizeIndex + delta] as FontSize | undefined;
    if (next) onChange({ ...prefs, fontSize: next });
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>{children}</DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[480px]">
        <DrawerHeader className="text-left">
          <DrawerTitle>읽기 설정</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          <section className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs font-medium">
              글자 크기
            </h3>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="icon-lg"
                className="min-h-11 min-w-11"
                aria-label="글자 작게"
                disabled={sizeIndex <= 0}
                onClick={() => stepSize(-1)}
              >
                <Minus aria-hidden />
              </Button>

              <div className="flex flex-1 items-center justify-center gap-1.5">
                {FONT_SIZES.map((size, i) => (
                  <span
                    key={size}
                    aria-hidden
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      i <= sizeIndex ? "bg-foreground" : "bg-muted",
                    )}
                  />
                ))}
              </div>

              <Button
                variant="secondary"
                size="icon-lg"
                className="min-h-11 min-w-11"
                aria-label="글자 크게"
                disabled={sizeIndex >= FONT_SIZES.length - 1}
                onClick={() => stepSize(1)}
              >
                <Plus aria-hidden />
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs font-medium">테마</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onChange({ ...prefs, theme: t.key })}
                  aria-pressed={prefs.theme === t.key}
                  className={cn(
                    "focus-visible:ring-ring flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    prefs.theme === t.key
                      ? "border-foreground"
                      : "border-border",
                  )}
                  style={{ backgroundColor: t.bg, color: t.fg }}
                >
                  <span className="text-base font-bold">가</span>
                  {t.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
