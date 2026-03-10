import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const compagnieId = searchParams.get('compagnie_id');

  const admin = createAdminClient();

  if (compagnieId) {
    const { data: comp } = await admin.from('compagnies').select('pdg_id').eq('id', compagnieId).single();
    if (!comp) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    const { data: empCheck } = await admin.from('compagnie_employes').select('id').eq('compagnie_id', compagnieId).eq('pilote_id', user.id).limit(1);
    if (comp.pdg_id !== user.id && !empCheck?.length) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const { data } = await admin.from('reparation_demandes')
      .select('*, entreprises_reparation(id, nom), compagnie_avions(id, immatriculation, nom)')
      .eq('compagnie_id', compagnieId)
      .order('created_at', { ascending: false });

    return NextResponse.json((data || []).map(d => {
      const rawEnt = d.entreprises_reparation as unknown;
      const ent = Array.isArray(rawEnt) ? rawEnt[0] : rawEnt;
      const rawAvion = d.compagnie_avions as unknown;
      const avion = Array.isArray(rawAvion) ? rawAvion[0] : rawAvion;
      return { ...d, entreprise: ent || null, avion: avion || null };
    }));
  }

  return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { entreprise_id, compagnie_id, avion_id, hangar_id, commentaire } = body;
  if (!entreprise_id || !compagnie_id || !avion_id || !hangar_id) {
    return NextResponse.json({ error: 'entreprise_id, compagnie_id, avion_id et hangar_id requis' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: comp } = await admin.from('compagnies').select('id, pdg_id, nom').eq('id', compagnie_id).single();
  if (!comp || comp.pdg_id !== user.id) return NextResponse.json({ error: 'Seul le PDG' }, { status: 403 });

  const { data: avion } = await admin.from('compagnie_avions')
    .select('id, immatriculation, nom, usure, compagnie_id')
    .eq('id', avion_id).single();
  if (!avion || avion.compagnie_id !== compagnie_id) return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });

  const { data: hangar } = await admin.from('reparation_hangars')
    .select('id, entreprise_id').eq('id', hangar_id).single();
  if (!hangar || hangar.entreprise_id !== entreprise_id) return NextResponse.json({ error: 'Hangar invalide' }, { status: 400 });

  const { data: existingDemande } = await admin.from('reparation_demandes')
    .select('id').eq('avion_id', avion_id)
    .not('statut', 'in', '("completee","refusee","annulee")')
    .limit(1);
  if (existingDemande?.length) return NextResponse.json({ error: 'Cet avion a déjà une demande en cours' }, { status: 409 });

  const { data: demande, error } = await admin.from('reparation_demandes').insert({
    entreprise_id,
    compagnie_id,
    avion_id,
    hangar_id,
    usure_avant: avion.usure ?? 0,
    commentaire_compagnie: commentaire ? String(commentaire).trim() : null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id, nom').eq('id', entreprise_id).single();
  if (ent) {
    await admin.from('messages').insert({
      destinataire_id: ent.pdg_id,
      titre: `🔧 Demande de réparation — ${avion.immatriculation}`,
      contenu: `La compagnie "${comp.nom}" demande la réparation de l'avion ${avion.immatriculation} (${avion.nom || 'sans nom'}).\nUsure actuelle : ${avion.usure ?? 0}%\n${commentaire ? `Message : ${commentaire}` : ''}`,
      type_message: 'normal',
    });
  }

  return NextResponse.json({ id: demande.id, message: 'Demande envoyée' });
}
