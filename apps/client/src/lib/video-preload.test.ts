import { describe, expect, it } from "vitest";
import { allowsVideoPreload, hasPlaybackBuffer, nextVideoToPreload } from "./video-preload";

describe("video preload budget", () => {
  it("skips speculation on slow connections or data saver", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      expect(allowsVideoPreload({ effectiveType })).toBe(false);
    }
    expect(allowsVideoPreload({ saveData: true, effectiveType: "4g" })).toBe(false);
    expect(allowsVideoPreload({ effectiveType: "4g" })).toBe(true);
    expect(allowsVideoPreload()).toBe(true);
  });

  const ready = { active: 2, direction: 1, count: 5, settled: 2, buffered: 2, enabled: true };
  it("prepares only the neighbour in the latest scroll direction", () => {
    expect(nextVideoToPreload(ready)).toBe(3);
    expect(nextVideoToPreload({ ...ready, direction: -1 })).toBe(1);
    expect(nextVideoToPreload({ ...ready, active: 4, settled: 4, buffered: 4 })).toBe(null);
    expect(nextVideoToPreload({ ...ready, active: 0, settled: 0, buffered: 0, direction: -1 })).toBe(null);
  });

  it("prioritizes the current video and ignores readiness from a skipped video", () => {
    expect(nextVideoToPreload({ ...ready, buffered: null })).toBe(null);
    expect(nextVideoToPreload({ ...ready, buffered: 1 })).toBe(null);
    expect(nextVideoToPreload({ ...ready, settled: 1 })).toBe(null);
    expect(nextVideoToPreload({ ...ready, enabled: false })).toBe(null);
  });

  it("requires contiguous playback buffer, including for short clips", () => {
    const ranges = (items: number[][]) => ({ length: items.length, start: (i: number) => items[i][0], end: (i: number) => items[i][1] });
    expect(hasPlaybackBuffer(ranges([[0, 5]]), 1, 30)).toBe(true);
    expect(hasPlaybackBuffer(ranges([[0, 2], [4, 15]]), 1, 30)).toBe(false);
    expect(hasPlaybackBuffer(ranges([]), 0, 30)).toBe(false);
    expect(hasPlaybackBuffer(ranges([[0, 2]]), 0, 2)).toBe(true);
    expect(hasPlaybackBuffer(ranges([[0, 2]]), 2, 2)).toBe(false);
  });
});
