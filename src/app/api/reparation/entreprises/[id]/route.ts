import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: entreprise } = await admin.from('entreprises_reparation').select('*').eq('id', id).single();
  if (!entreprise) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });

  const { data: employes } = await admin.from('reparation_employes')
    .select('id, user_id, role, specialite, date_embauche, profiles(id, callsign)')
    .eq('entreprise_id', id);

  const { data: hangars } = await admin.from('reparation_hangars').select('*').eq('entreprise_id', id);
  const { data: tarifs } = await admin.from('reparation_tarifs')
    .select('*, types_avion(id, nom)')
    .eq('entreprise_id', id);

  const { data: compte } = await admin.from('felitz_comptes')
    .select('id, vban, solde')
    .eq('entreprise_reparation_id', id).eq('type', 'reparation').single();

  const { data: demandes } = await admin.from('reparation_demandes')
    .select('*, compagnies(id, nom), compagnie_avions(id, immatriculation, nom)')
    .eq('entreprise_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const employesNorm = (employes || []).map(e => {
    const raw = e.profiles as unknown;
    const profile = Array.isArray(raw) ? raw[0] : raw;
    return { ...e, profile: profile || null };
  });

  const tarifsNorm = (tarifs || []).map(t => {
    const raw = t.types_avion as unknown;
    const type = Array.isArray(raw) ? raw[0] : raw;
    return { ...t, type_avion: type || null };
  });

  const demandesNorm = (demandes || []).map(d => {
    const rawComp = d.compagnies as unknown;
    const comp = Array.isArray(rawComp) ? rawComp[0] : rawComp;
    const rawAvion = d.compagnie_avions as unknown;
    const avion = Array.isArray(rawAvion) ? rawAvion[0] : rawAvion;
    return { ...d, compagnie: comp || null, avion: avion || null };
  });

  const myEmploi = (employes || []).find(e => String(e.user_id) === String(user.id));
  const myRole = String(entreprise.pdg_id) === String(user.id) ? 'pdg' : myEmploi?.role || null;

  return NextResponse.json({
    ...entreprise,
    employes: employesNorm,
    hangars: hangars || [],
    tarifs: tarifsNorm,
    compte: compte || null,
    demandes: demandesNorm,
    my_role: myRole,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { data: entreprise } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', id).single();
  const isPdg = entreprise && String(entreprise.pdg_id) === String(user.id);
  if (!entreprise || (!isPdg && !isAdmin)) return NextResponse.json({ error: 'Seul le PDG peut modifier l\'entreprise' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.nom !== undefined) updates.nom = String(body.nom).trim();
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null;
  if (body.prix_hangar_base !== undefined) updates.prix_hangar_base = Math.max(0, Number(body.prix_hangar_base) || 500000);
  if (body.prix_hangar_multiplicateur !== undefined) updates.prix_hangar_multiplicateur = Math.max(1, Math.min(10, Number(body.prix_hangar_multiplicateur) || 2));
  if (body.alliance_reparation_actif !== undefined) updates.alliance_reparation_actif = Boolean(body.alliance_reparation_actif);
  if (body.alliance_id !== undefined) updates.alliance_id = body.alliance_id ? String(body.alliance_id) : null;
  if (body.prix_alliance_pourcent !== undefined) updates.prix_alliance_pourcent = Math.max(0, Math.min(100, Number(body.prix_alliance_pourcent) ?? 80));

  const { error } = await admin.from('entreprises_reparation').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: entreprise } = await admin.from('entreprises_reparation').select('id, nom, pdg_id').eq('id', id).single();
  if (!entreprise) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const isPdg = String(entreprise.pdg_id) === String(user.id);
  if (!isPdg && !isAdmin) {
    return NextResponse.json({ error: 'Seul le PDG ou un admin peut fermer l\'entreprise' }, { status: 403 });
  }

  await admin.from('entreprises_reparation').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
