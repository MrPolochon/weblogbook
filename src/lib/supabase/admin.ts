import { createClient } from '@supabase/supabase-js';

/**
 * Client Supabase avec service_role — à utiliser UNIQUEMENT côté serveur
 * (API routes, Server Actions) pour createUser, etc.
 */
export function createAdminClient(options?: { fetch?: typeof fetch }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Missing Supabase admin env');
  const customFetch = options?.fetch ?? fetch;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => customFetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
