import { describe, expect, it } from "vitest";
import {
  COVER_FACES,
  COVER_TEMPLATES,
  defaultCoverDesign,
  readCoverDesign,
} from "./cover-design";

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

describe("image template designs", () => {
  const design = {
    ...defaultCoverDesign("운수 좋은 날", "현진건"),
    template: "image" as const,
    images: { front: "https://example.supabase.co/storage/v1/object/public/covers/b/design-front-1.webp" },
  };
  it("keeps saved face image addresses", () => {
    expect(readCoverDesign(design)).toEqual(design);
    const full = {
      ...design,
      images: { ...design.images, spine: "blob:http://localhost/1", back: "blob:http://localhost/2" },
    };
    expect(readCoverDesign(full)).toEqual(full);
  });
  it("requires a front image for the image template", () => {
    expect(readCoverDesign({ ...design, images: undefined })).toBeNull();
    expect(readCoverDesign({ ...design, images: { spine: "blob:x" } })).toBeNull();
    expect(readCoverDesign({ ...design, images: { front: "" } })).toBeNull();
    expect(readCoverDesign({ ...design, images: { front: "x".repeat(2049) } })).toBeNull();
  });
  it("ignores stray image addresses on drawn templates", () => {
    const drawn = { ...design, template: "classic" as const };
    expect(readCoverDesign(drawn)).toEqual(drawn);
  });
  it("lists the image template after the drawn ones", () => {
    expect(COVER_TEMPLATES.map((t) => t.id)).toEqual(["classic", "modern", "literary", "image"]);
    expect(COVER_FACES).toEqual(["front", "spine", "back"]);
  });
});
