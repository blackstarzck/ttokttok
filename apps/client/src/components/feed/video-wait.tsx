"use client";

import { useEffect, useState } from "react";

/** Avoid flashing a loading message during normal, short transitions. */
export function VideoWait({ onRetry }: { onRetry: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const notice = window.setTimeout(() => setStage(1), 500);
    const retry = window.setTimeout(() => setStage(2), 8000);
    return () => { window.clearTimeout(notice); window.clearTimeout(retry); };
  }, []);
  if (stage === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center p-6">
      <div role="status" className="bg-background text-foreground flex flex-col items-center gap-2 rounded-lg border p-4 text-center text-sm break-keep">
        <p>{stage === 1 ? "영상을 불러오는 중이에요." : "영상 준비가 늦어지고 있어요."}</p>
        {stage === 2 ? (
          <button type="button" onClick={onRetry} className="pointer-events-auto focus-visible:ring-ring min-h-11 rounded-md px-4 underline focus-visible:ring-2 focus-visible:outline-none">
            영상 다시 시도
          </button>
        ) : null}
      </div>
    </div>
  );
}
