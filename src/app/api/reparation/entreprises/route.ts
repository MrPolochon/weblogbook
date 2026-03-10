import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: emploi } = await admin.from('reparation_employes')
    .select('entreprise_id, role')
    .eq('user_id', user.id);

  if (!emploi?.length) {
    const { data: own } = await admin.from('entreprises_reparation').select('*').eq('pdg_id', user.id);
    return NextResponse.json(own || []);
  }

  const ids = Array.from(new Set((emploi || []).map(e => e.entreprise_id)));
  const { data: own } = await admin.from('entreprises_reparation').select('*').eq('pdg_id', user.id);
  (own || []).forEach(o => { if (!ids.includes(o.id)) ids.push(o.id); });

  const { data } = await admin.from('entreprises_reparation').select('*').in('id', ids);
  return NextResponse.json((data || []).map(e => ({
    ...e,
    my_role: e.pdg_id === user.id ? 'pdg' : emploi?.find(emp => emp.entreprise_id === e.id)?.role || 'technicien',
  })));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { nom, description } = body;
  if (!nom || String(nom).trim().length < 2) return NextResponse.json({ error: 'Nom requis (min 2 caractères)' }, { status: 400 });

  const admin = createAdminClient();

  const { data: existing } = await admin.from('entreprises_reparation').select('id').eq('pdg_id', user.id).limit(1);
  if (existing?.length) return NextResponse.json({ error: 'Vous avez déjà une entreprise de réparation' }, { status: 400 });

  const { data: entreprise, error } = await admin.from('entreprises_reparation').insert({
    nom: String(nom).trim(),
    pdg_id: user.id,
    description: description ? String(description).trim() : null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('reparation_employes').insert({
    entreprise_id: entreprise.id,
    user_id: user.id,
    role: 'pdg',
  });

  let vban = '';
  for (let i = 0; i < 20; i++) {
    vban = 'MIXREPAIR' + Math.random().toString(36).substring(2, 18).toUpperCase();
    const { data: exists } = await admin.from('felitz_comptes').select('id').eq('vban', vban).limit(1);
    if (!exists?.length) break;
  }
  await admin.from('felitz_comptes').insert({
    type: 'reparation',
    entreprise_reparation_id: entreprise.id,
    vban,
    solde: 0,
  });

  return NextResponse.json({ id: entreprise.id });
}
