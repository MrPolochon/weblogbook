export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/** Liste les passkeys de l'utilisateur connecté. */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('user_passkeys')
      .select('id, device_name, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[passkeys GET]', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    return NextResponse.json({ passkeys: data ?? [] });
  } catch (e) {
    console.error('[passkeys GET]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
