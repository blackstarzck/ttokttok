import { describe, expect, it } from "vitest";
import { safeAdminPath } from "./admin-path";

describe("admin return address", () => {
  it.each(["https://example.com/admin", "//example.com/admin", "/admin/../../profile", "/administrator", "/admin\\evil", "javascript:alert(1)", null, ["/admin/posts"]])("rejects an unsafe target: %s", target => {
    expect(safeAdminPath(target)).toBe("/admin");
  });
  it("preserves a safe admin path and query", () => {
    expect(safeAdminPath("/admin/posts?edit=1")).toBe("/admin/posts?edit=1");
  });
});
