import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service role 클라이언트 — RLS를 우회한다. **서버에서만** 쓴다.
 *
 * 용도는 두 가지뿐이다 (FRONTEND.md §5):
 *   1. 비공개 epubs 버킷의 signed URL 발급
 *   2. 어드민 API
 *
 * `server-only`를 import하므로 클라이언트 번들에 섞이면 빌드가 깨진다.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
