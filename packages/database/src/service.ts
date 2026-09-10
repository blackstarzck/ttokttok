import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Privileged storage operations. Each caller must enforce its own authorization. */
export function createServiceDatabase(url: string, serviceKey: string) {
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
