import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculerPrixHangar } from '@/lib/compagnie-utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entrepriseId = searchParams.get('entreprise_id');
  if (!entrepriseId) return NextResponse.json({ error: 'entreprise_id requis' }, { status: 400 });

  const admin = createAdminClient();
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
    .select('pdg_id, prix_hangar_base, prix_hangar_multiplicateur')
    .eq('id', entreprise_id).single();
  const isPdg = ent && String(ent.pdg_id) === String(user.id);
  if (!ent || (!isPdg && !isAdmin)) return NextResponse.json({ error: 'Seul le PDG peut ajouter un hangar' }, { status: 403 });

  const ac = String(aeroport_code).toUpperCase().trim();
  const cap = Math.max(1, Math.min(20, Number(capacite) || 2));

  const { count } = await admin.from('reparation_hangars')
    .select('*', { count: 'exact', head: true })
    .eq('entreprise_id', entreprise_id);
  const numHangar = (count ?? 0) + 1;
  const base = ent.prix_hangar_base ?? 500000;
  const mult = ent.prix_hangar_multiplicateur ?? 2;
  const prix = calculerPrixHangar(numHangar, cap, base, mult);

  if (prix > 0) {
    const { data: compte } = await admin.from('felitz_comptes')
      .select('id, solde')
      .eq('entreprise_reparation_id', entreprise_id)
      .eq('type', 'reparation')
      .single();

    if (!compte || compte.solde < prix) {
      return NextResponse.json({
        error: `Solde insuffisant. Prix : ${prix.toLocaleString('fr-FR')} F$.`
      }, { status: 400 });
    }

    const { data: debitOk } = await admin.rpc('debiter_compte_safe', { p_compte_id: compte.id, p_montant: prix });
    if (!debitOk) {
      return NextResponse.json({ error: 'Solde insuffisant (transaction concurrente).' }, { status: 400 });
    }

    await admin.from('felitz_transactions').insert({
      compte_id: compte.id,
      type: 'debit',
      montant: prix,
      libelle: `Achat hangar ${ac}`,
    });
  }

  const { data: hangar, error } = await admin.from('reparation_hangars').insert({
    entreprise_id,
    aeroport_code: ac,
    nom: nom ? String(nom).trim() : null,
    capacite: cap,
    prix_achat: prix,
    achat_le: prix > 0 ? new Date().toISOString() : null,
  }).select('id').single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Hangar déjà existant pour cet aéroport' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: hangar?.id, prix });
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

  await admin.from('reparation_hangars').delete().eq('id', hangarId);
  return NextResponse.json({ ok: true });
}
