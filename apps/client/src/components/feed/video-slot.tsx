"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

// The scroller owns scheduling; server-rendered PostItem children stay on the server.
const VideoSlotContext = createContext<{
  preload: boolean;
  reportBuffer: (ready: boolean) => void;
} | null>(null);

export function VideoSlot({ index, preload, onBuffer, children }: {
  index: number;
  preload: boolean;
  onBuffer: (index: number, ready: boolean) => void;
  children: React.ReactNode;
}) {
  const reportBuffer = useCallback((ready: boolean) => onBuffer(index, ready), [index, onBuffer]);
  const value = useMemo(() => ({ preload, reportBuffer }), [preload, reportBuffer]);
  return <VideoSlotContext value={value}>{children}</VideoSlotContext>;
}

export function useVideoSlot() {
  return useContext(VideoSlotContext);
}
