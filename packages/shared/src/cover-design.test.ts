import { describe, expect, it } from "vitest";
import { defaultCoverDesign, readCoverDesign } from "./cover-design";

describe("saved book cover designs", () => {
  const design = defaultCoverDesign("운수 좋은 날", "현진건");
  it("round trips the image's actual wording and editing settings", () => {
    expect(readCoverDesign(JSON.parse(JSON.stringify(design)))).toEqual(design);
  });
  it.each([
    null,
    [],
    {},
    { ...design, version: 2 },
    { ...design, template: "unknown" },
    { ...design, palette: "unknown" },
    { ...design, angle: 181 },
    { ...design, tilt: 91 },
    { ...design, angle: NaN },
    { ...design, thickness: -1 },
    { ...design, title: " " },
    { ...design, title: "가".repeat(121) },
    { ...design, author: "가".repeat(81) },
  ])("rejects unsupported or invalid saved data: %j", (value) => {
    expect(readCoverDesign(value)).toBeNull();
  });
  it("restores older designs without a tilt setting", () => {
    const legacy = { ...design } as Partial<typeof design>;
    delete legacy.tilt;
    expect(readCoverDesign(legacy)).toEqual(design);
  });
  it.each([-180, -90, 90, 180])(
    "restores side and rear views at %s degrees",
    (angle) => {
      expect(readCoverDesign({ ...design, angle, tilt: -90 })?.angle).toBe(
        angle,
      );
    },
  );
});
