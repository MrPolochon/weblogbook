import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const compIds = await getLeaderCompagnieIds(user.id, admin);
    if (compIds.length === 0) return NextResponse.json([]);

    // Récupérer les invitations en attente
    const { data: invitations, error: invError } = await admin.from('alliance_invitations')
      .select('id, alliance_id, compagnie_id, message')
      .eq('statut', 'en_attente')
      .in('compagnie_id', compIds);

    if (invError) {
      console.error('invitations-pending query error:', invError.message);
      return NextResponse.json([]);
    }

    if (!invitations?.length) return NextResponse.json([]);

    // Récupérer les noms des alliances séparément (évite les problèmes de FK join)
    const allianceIds = Array.from(new Set(invitations.map(inv => inv.alliance_id)));
    const { data: alliancesData } = await admin.from('alliances')
      .select('id, nom')
      .in('id', allianceIds);
    const allianceMap = Object.fromEntries((alliancesData || []).map(a => [a.id, a.nom]));

    return NextResponse.json(invitations.map(inv => ({
      id: inv.id,
      alliance_id: inv.alliance_id,
      alliance_nom: allianceMap[inv.alliance_id] || 'Alliance',
      message: inv.message,
    })));
  } catch (e) {
    console.error('invitations-pending error:', e);
    return NextResponse.json([]);
  }
}
