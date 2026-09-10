import 'server-only';
import { createServiceDatabase } from '@ttokttok/database/service';

export function createAdminClient() {
  return createServiceDatabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
