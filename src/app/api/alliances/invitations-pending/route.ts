import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myComps } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const compIds = (myComps || []).map(c => c.id);
  if (compIds.length === 0) return NextResponse.json([]);

  const { data: invitations } = await admin.from('alliance_invitations')
    .select('id, alliance_id, compagnie_id, message, alliances(nom)')
    .eq('statut', 'en_attente')
    .in('compagnie_id', compIds);

  return NextResponse.json((invitations || []).map(inv => {
    const raw = inv.alliances as unknown;
    const alliance = Array.isArray(raw) ? raw[0] : raw;
    return {
      id: inv.id,
      alliance_id: inv.alliance_id,
      alliance_nom: (alliance as { nom?: string })?.nom || 'Alliance',
      message: inv.message,
    };
  }));
}
