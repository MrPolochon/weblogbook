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
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const { data: entRow } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', entrepriseId).single();
  if (!entRow) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });
  const { data: empT } = await admin.from('reparation_employes').select('id').eq('entreprise_id', entrepriseId).eq('user_id', user.id).limit(1);
  const allowed = profile?.role === 'admin' || String(entRow.pdg_id) === String(user.id) || !!empT?.length;
  if (!allowed) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data } = await admin.from('reparation_tarifs')
    .select('id, entreprise_id, prix_par_point, duree_estimee_par_point, created_at')
    .eq('entreprise_id', entrepriseId)
    .limit(1)
    .maybeSingle();

  return NextResponse.json(data ? [{ ...data, type_avion: null }] : []);
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { entreprise_id, prix_par_point, duree_estimee_par_point } = body;
  if (!entreprise_id) return NextResponse.json({ error: 'entreprise_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', entreprise_id).single();
  const isPdg = ent && String(ent.pdg_id) === String(user.id);
  if (!ent || (!isPdg && !isAdmin)) return NextResponse.json({ error: 'Seul le PDG peut modifier les tarifs' }, { status: 403 });

  const price = prix_par_point === undefined ? 1000 : Number(prix_par_point);
  const duration = duree_estimee_par_point === undefined ? 2 : Number(duree_estimee_par_point);
  const validNumberInput = (value: unknown) => value === undefined || typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim());
  if (!validNumberInput(prix_par_point) || !validNumberInput(duree_estimee_par_point)) return NextResponse.json({ error: 'Tarif et durée doivent être des nombres.' }, { status: 400 });
  if (!Number.isFinite(price) || price < 0 || price > Number.MAX_SAFE_INTEGER || !Number.isFinite(duration) || duration < 1 || duration > Number.MAX_SAFE_INTEGER || prix_par_point === null || duree_estimee_par_point === null) {
    return NextResponse.json({ error: 'Prix positif ou nul et durée supérieure ou égale à une minute requis.' }, { status: 400 });
  }
  const { error } = await admin.from('reparation_tarifs').upsert(
    {
      entreprise_id,
      type_avion_id: null,
      prix_par_point: price,
      duree_estimee_par_point: duration,
    },
    { onConflict: 'entreprise_id' }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
