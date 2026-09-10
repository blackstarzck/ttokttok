/** Only permit paths served by the admin app after password authentication. */
export function safeAdminPath(value: unknown): string {
  if (typeof value !== "string" || /[\\\r\n]/.test(value)) return "/admin";
  const path = value.split(/[?#]/, 1)[0];
  if (path !== "/admin" && !path.startsWith("/admin/")) return "/admin";
  const url = new URL(value, "https://admin.invalid");
  if (url.origin !== "https://admin.invalid" || (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/"))) return "/admin";
  return url.pathname + url.search + url.hash;
}
