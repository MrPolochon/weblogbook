import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entrepriseId = searchParams.get('entreprise_id');
  if (!entrepriseId) return NextResponse.json({ error: 'entreprise_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from('reparation_tarifs')
    .select('*, types_avion(id, nom)')
    .eq('entreprise_id', entrepriseId);

  return NextResponse.json((data || []).map(t => {
    const raw = t.types_avion as unknown;
    const type = Array.isArray(raw) ? raw[0] : raw;
    return { ...t, type_avion: type || null };
  }));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { entreprise_id, type_avion_id, prix_par_point, duree_estimee_par_point } = body;
  if (!entreprise_id) return NextResponse.json({ error: 'entreprise_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', entreprise_id).single();
  const isPdg = ent && String(ent.pdg_id) === String(user.id);
  if (!ent || (!isPdg && !isAdmin)) return NextResponse.json({ error: 'Seul le PDG peut modifier les tarifs' }, { status: 403 });

  const { error } = await admin.from('reparation_tarifs').upsert({
    entreprise_id,
    type_avion_id: type_avion_id || null,
    prix_par_point: Math.max(0, Number(prix_par_point) || 1000),
    duree_estimee_par_point: Math.max(1, Number(duree_estimee_par_point) || 2),
  }, { onConflict: 'entreprise_id,type_avion_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
