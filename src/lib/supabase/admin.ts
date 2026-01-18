import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase avec service_role — à utiliser UNIQUEMENT côté serveur
 * (API routes, Server Actions) pour createUser, etc.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Missing Supabase admin env');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
