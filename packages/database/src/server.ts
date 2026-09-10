import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { Database } from "./types";

/** Request cookies are supplied by the app; this package has no Next.js dependency. */
export function createServerDatabase(
  url: string,
  key: string,
  cookies: CookieMethodsServer,
  cookieName?: string,
) {
  return createServerClient<Database>(url, key, {
    // Separate deployments cannot invalidate one another's Next.js data cache.
    // These request-scoped queries must see the latest committed content.
    global: {
      fetch: (input, init) => {
        const options = { ...init, cache: "no-store" as const };
        return fetch(input, options);
      },
    },
    cookies,
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
  });
}
