import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const company = new URL(req.url).searchParams.get('compagnie_id');
  const admin = createAdminClient();
  const companies = await getLeaderCompagnieIds(user.id, admin);
  if (!company || !companies.includes(company)) return NextResponse.json({ error: 'Accès réservé à la direction' }, { status: 403 });
  const { data, error } = await admin.from('alliance_transferts_avions')
    .select('id,alliance_id,type_transfert,prix,duree_jours,compagnie_source_id,compagnie_avions(immatriculation),source:compagnies!alliance_transferts_avions_compagnie_source_id_fkey(nom)')
    .eq('compagnie_dest_id', company).eq('statut', 'en_attente').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
