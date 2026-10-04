import { createBrowserClient } from '@supabase/ssr';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return createBrowserClient(url, key, {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        // Keep large Storage uploads independent of the authentication deadline.
        return new URL(requestUrl).pathname.startsWith('/auth/v1/')
          ? fetchWithTimeout(input, init)
          : fetch(input, init);
      },
    },
  });
}
