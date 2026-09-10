export function clientUrl() {
  const value = process.env.CLIENT_URL;
  if (value) return new URL(value).origin;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("CLIENT_URL must be configured for the admin deployment.");
}
