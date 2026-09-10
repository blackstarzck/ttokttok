import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/** Browser access only. A service credential must never be passed here. */
export function createBrowserDatabase(
  url: string,
  key: string,
  cookieName?: string,
) {
  return createBrowserClient<Database>(url, key, {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
  });
}
