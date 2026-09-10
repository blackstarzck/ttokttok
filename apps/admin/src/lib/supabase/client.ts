import { createBrowserDatabase } from '@ttokttok/database/browser';

export function createClient() {
  return createBrowserDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, "ttokttok-admin-auth");
}
