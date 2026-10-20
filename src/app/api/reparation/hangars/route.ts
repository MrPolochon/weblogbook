import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { REPARATION_STATUTS_ACTIFS } from '@/lib/reparation-transit';

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
  const { data: empH } = await admin.from('reparation_employes').select('id').eq('entreprise_id', entrepriseId).eq('user_id', user.id).limit(1);
  const allowed = profile?.role === 'admin' || String(entRow.pdg_id) === String(user.id) || !!empH?.length;
  if (!allowed) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data } = await admin.from('reparation_hangars').select('*').eq('entreprise_id', entrepriseId);
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { entreprise_id, aeroport_code, nom, capacite } = body;
  if (!entreprise_id || !aeroport_code) return NextResponse.json({ error: 'entreprise_id et aeroport_code requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const { data: ent } = await admin.from('entreprises_reparation')
    .select('*')
    .eq('id', entreprise_id).single();
  if (!ent) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });

  const isPdg = String(ent.pdg_id) === String(user.id);
  if (!isPdg && !isAdmin) return NextResponse.json({ error: 'Seul le PDG peut ajouter un hangar' }, { status: 403 });

  const ac = String(aeroport_code).toUpperCase().trim();
  const cap = capacite === undefined ? 2 : Number(capacite);
  if (!Number.isInteger(cap) || cap < 1 || cap > 20 || !CODES_OACI_VALIDES.has(ac)) {
    return NextResponse.json({ error: 'Choisissez un aéroport valide et une capacité entière de 1 à 20.' }, { status: 400 });
  }
  const { data, error } = await admin.rpc('acheter_hangar_reparation_atomic', {
    p_actor: user.id, p_entreprise: entreprise_id, p_aeroport: ac,
    p_nom: nom ? String(nom).trim() : null, p_capacite: cap,
  });
  if (error) {
    console.error('Achat hangar atomique:', error);
    return NextResponse.json({ error: error.code === '23505' ? 'Hangar déjà existant pour cet aéroport' : error.code === 'P0001' ? error.message : 'Achat non effectué. Réessayez.' }, { status: error.code === '23505' ? 409 : error.code === '42501' ? 403 : 400 });
  }
  if (!data?.ok) return NextResponse.json({ error: 'Achat non confirmé. Réessayez.' }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const hangarId = searchParams.get('id');
  if (!hangarId) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { data: hangar } = await admin.from('reparation_hangars').select('entreprise_id').eq('id', hangarId).single();
  if (!hangar) return NextResponse.json({ error: 'Hangar introuvable' }, { status: 404 });

  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', hangar.entreprise_id).single();
  const isPdg = ent && String(ent.pdg_id) === String(user.id);
  if (!ent || (!isPdg && !isAdmin)) return NextResponse.json({ error: 'Seul le PDG peut supprimer un hangar' }, { status: 403 });

  // CASCADE sur hangar_id effacerait les demandes et laisserait les avions
  // bloqués en_reparation / en_transit « invisibles » côté workflow.
  const { data: hangarFull } = await admin
    .from('reparation_hangars')
    .select('aeroport_code')
    .eq('id', hangarId)
    .single();

  const { data: actives } = await admin
    .from('reparation_demandes')
    .select('id, avion_id, statut')
    .eq('hangar_id', hangarId)
    .in('statut', [...REPARATION_STATUTS_ACTIFS]);

  if (actives?.length) {
    const avionIds = Array.from(new Set(actives.map((d) => d.avion_id).filter(Boolean)));
    if (avionIds.length > 0) {
      const updates: Record<string, unknown> = { statut: 'ground' };
      if (hangarFull?.aeroport_code) {
        updates.aeroport_actuel = String(hangarFull.aeroport_code).trim().toUpperCase();
      }
      await admin.from('compagnie_avions').update(updates).in('id', avionIds);
    }
    await admin
      .from('reparation_demandes')
      .update({ statut: 'annulee' })
      .in('id', actives.map((d) => d.id));
  }

  await admin.from('reparation_hangars').delete().eq('id', hangarId);
  return NextResponse.json({
    ok: true,
    demandes_annulees: actives?.length ?? 0,
    avions_liberes: actives ? Array.from(new Set(actives.map((d) => d.avion_id))).length : 0,
  });
}
