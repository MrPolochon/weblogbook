import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** POST: quitter l'alliance (PDG de la compagnie) */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { compagnie_id } = body;
  if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: compagnie } = await admin.from('compagnies').select('id, pdg_id').eq('id', compagnie_id).single();
  if (!compagnie || compagnie.pdg_id !== user.id) return NextResponse.json({ error: 'Seul le PDG peut faire quitter la compagnie' }, { status: 403 });

  const { data: mem } = await admin.from('alliance_membres').select('alliance_id').eq('compagnie_id', compagnie_id).eq('alliance_id', allianceId).single();
  if (!mem) return NextResponse.json({ error: 'Cette compagnie n\'est pas dans cette alliance' }, { status: 400 });

  const { error } = await admin.rpc('alliance_quitter', { p_compagnie_id: compagnie_id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
