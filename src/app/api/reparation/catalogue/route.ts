import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: entreprises } = await admin.from('entreprises_reparation').select('id, nom, description, logo_url');
  if (!entreprises?.length) return NextResponse.json([]);

  const ids = entreprises.map(e => e.id);
  const { data: hangars } = await admin.from('reparation_hangars').select('id, entreprise_id, aeroport_code, nom, capacite').in('entreprise_id', ids);
  const { data: tarifs } = await admin.from('reparation_tarifs').select('entreprise_id, type_avion_id, prix_par_point, types_avion(id, nom)').in('entreprise_id', ids);

  return NextResponse.json(entreprises.map(e => ({
    ...e,
    hangars: (hangars || []).filter(h => h.entreprise_id === e.id),
    tarifs: (tarifs || []).filter(t => t.entreprise_id === e.id).map(t => {
      const raw = t.types_avion as unknown;
      const type = Array.isArray(raw) ? raw[0] : raw;
      return { ...t, type_avion: type || null };
    }),
  })));
}
