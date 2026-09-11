/** Speculative video loading is optional; current playback always takes priority. */
export function allowsVideoPreload(connection?: {
  saveData?: boolean;
  effectiveType?: string;
}) {
  return !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "");
}

export function nextVideoToPreload({
  active, direction, count, settled, buffered, enabled,
}: {
  active: number;
  direction: number;
  count: number;
  settled: number | null;
  buffered: number | null;
  enabled: boolean;
}): number | null {
  if (!enabled || settled !== active || buffered !== active) return null;
  const next = active + (direction < 0 ? -1 : 1);
  return next >= 0 && next < count ? next : null;
}

/** A later buffered range does not help playback across a gap. */
export function hasPlaybackBuffer(
  buffered: { length: number; start(index: number): number; end(index: number): number },
  currentTime: number,
  duration: number,
) {
  const required = Number.isFinite(duration) ? Math.min(3, duration - currentTime) : 3;
  if (required <= 0) return false;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime && buffered.end(i) - currentTime >= required) return true;
  }
  return false;
}
