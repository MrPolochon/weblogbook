import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function getPfTesterAdmin(): Promise<{ isAdmin: boolean; userId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { isAdmin: false, userId: null };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return { isAdmin: profile?.role === 'admin', userId: user.id };
}

export async function requirePfTesterAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const { isAdmin, userId } = await getPfTesterAdmin();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }
  if (!isAdmin) {
    return { ok: false, response: NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 }) };
  }
  return { ok: true, userId };
}
