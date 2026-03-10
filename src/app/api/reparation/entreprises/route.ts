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

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { nom, description, pdg_id } = body;
  if (!nom || String(nom).trim().length < 2) return NextResponse.json({ error: 'Nom requis (min 2 caractères)' }, { status: 400 });
  if (!pdg_id) return NextResponse.json({ error: 'pdg_id requis' }, { status: 400 });

  const { data: pdgProfile } = await admin.from('profiles').select('id').eq('id', pdg_id).single();
  if (!pdgProfile) return NextResponse.json({ error: 'Utilisateur PDG introuvable' }, { status: 404 });

  const { data: entreprise, error } = await admin.from('entreprises_reparation').insert({
    nom: String(nom).trim(),
    pdg_id,
    description: description ? String(description).trim() : null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('reparation_employes').insert({
    entreprise_id: entreprise.id,
    user_id: pdg_id,
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
