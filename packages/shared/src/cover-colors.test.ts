import { describe, expect, it } from "vitest";
import { deriveCoverColors } from "./cover-colors";

/** width×height RGBA. `edge`는 바깥 테두리, `center`는 안쪽 색. */
function frame(
  width: number,
  height: number,
  edge: [number, number, number],
  center: [number, number, number],
  border = Math.round(width * 0.08),
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const inner =
        x >= border && x < width - border && y >= border && y < height - border;
      const [r, g, b] = inner ? center : edge;
      pixels.set([r, g, b, 255], (y * width + x) * 4);
    }
  return pixels;
}

describe("deriveCoverColors", () => {
  it("takes the board colour from the outer 8% ring, not the centre", () => {
    const colors = deriveCoverColors(frame(100, 150, [32, 64, 96], [250, 250, 250]), 100, 150);
    expect(colors.base).toBe("#204060");
    expect(colors.ink).toBe("light");
  });
  it("uses dark ink on a light edge", () => {
    const colors = deriveCoverColors(frame(50, 75, [240, 236, 228], [0, 0, 0]), 50, 75);
    expect(colors.base).toBe("#f0ece4");
    expect(colors.ink).toBe("dark");
  });
  it("mixes the accent 35% toward the ink from the base", () => {
    const dark = deriveCoverColors(frame(20, 30, [0, 0, 0], [0, 0, 0]), 20, 30);
    expect(dark.ink).toBe("light");
    expect(dark.accent).toBe("#595959"); // 0 + 0.35 × 255
    const light = deriveCoverColors(frame(20, 30, [255, 255, 255], [255, 255, 255]), 20, 30);
    expect(light.ink).toBe("dark");
    expect(light.accent).toBe("#a6a6a6"); // 255 − 0.35 × 255
  });
  it("averages a mixed edge and pads single-digit hex channels", () => {
    const pixels = frame(10, 10, [0, 0, 0], [0, 0, 0], 1);
    // 왼쪽 세로 테두리 열만 붉게 — 36개 테두리 픽셀 중 10개.
    for (let y = 0; y < 10; y++) pixels.set([36, 0, 0, 255], y * 10 * 4);
    expect(deriveCoverColors(pixels, 10, 10).base).toBe("#0a0000");
  });
  it("rejects buffers that do not match the dimensions", () => {
    expect(() => deriveCoverColors(new Uint8ClampedArray(8), 2, 2)).toThrow();
  });
});
