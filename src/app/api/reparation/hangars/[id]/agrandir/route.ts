import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Prix d'une place supplémentaire = 1/5 du prix de base du hangar (min 10 000 F$). */
function calculerPrixParPlace(prixHangarBase: number): number {
  return Math.max(10000, Math.floor(prixHangarBase / 5));
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nbPlaces = Math.max(1, Math.min(19, Number(body.nb_places_ajoutees) || 1));

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  const { data: hangar } = await admin
    .from('reparation_hangars')
    .select('id, entreprise_id, capacite, prix_achat')
    .eq('id', id)
    .single();

  if (!hangar) return NextResponse.json({ error: 'Hangar introuvable' }, { status: 404 });

  const { data: ent } = await admin
    .from('entreprises_reparation')
    .select('pdg_id, prix_hangar_base')
    .eq('id', hangar.entreprise_id)
    .single();

  if (!ent) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });

  const isPdg = String(ent.pdg_id) === String(user.id);
  if (!isPdg && !isAdmin) {
    return NextResponse.json({ error: 'Seul le PDG peut agrandir un hangar' }, { status: 403 });
  }

  const newCapacite = hangar.capacite + nbPlaces;
  if (newCapacite > 20) {
    return NextResponse.json({
      error: `Capacité maximale : 20 places. Actuelle : ${hangar.capacite} — Ajout possible : ${20 - hangar.capacite} place(s).`,
    }, { status: 400 });
  }

  const prixHangarBase = (ent.prix_hangar_base as number) ?? 500000;
  const prixParPlace = calculerPrixParPlace(prixHangarBase);
  const prixTotal = prixParPlace * nbPlaces;

  if (prixTotal > 0) {
    const { data: compte } = await admin
      .from('felitz_comptes')
      .select('id, solde')
      .eq('entreprise_reparation_id', hangar.entreprise_id)
      .eq('type', 'reparation')
      .single();

    if (!compte || compte.solde < prixTotal) {
      return NextResponse.json({
        error: `Solde insuffisant. Prix : ${prixTotal.toLocaleString('fr-FR')} F$ (${prixParPlace.toLocaleString('fr-FR')} F$/place).`,
      }, { status: 400 });
    }

    const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
      p_compte_id: compte.id,
      p_montant: prixTotal,
    });
    if (!debitOk) {
      return NextResponse.json({ error: 'Solde insuffisant (transaction concurrente).' }, { status: 400 });
    }

    await admin.from('felitz_transactions').insert({
      compte_id: compte.id,
      type: 'debit',
      montant: prixTotal,
      libelle: `Agrandissement hangar +${nbPlaces} place${nbPlaces > 1 ? 's' : ''} → ${newCapacite} places`,
    });
  }

  const { error } = await admin
    .from('reparation_hangars')
    .update({ capacite: newCapacite })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    capacite: newCapacite,
    prix_paye: prixTotal,
    prix_par_place: prixParPlace,
  });
}

/** GET : retourne le prix par place pour affichage UI avant confirmation */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: hangar } = await admin
    .from('reparation_hangars')
    .select('id, entreprise_id, capacite')
    .eq('id', id)
    .single();

  if (!hangar) return NextResponse.json({ error: 'Hangar introuvable' }, { status: 404 });

  const { data: ent } = await admin
    .from('entreprises_reparation')
    .select('prix_hangar_base')
    .eq('id', hangar.entreprise_id)
    .single();

  const prixHangarBase = (ent?.prix_hangar_base as number) ?? 500000;
  const prixParPlace = calculerPrixParPlace(prixHangarBase);

  return NextResponse.json({
    capacite_actuelle: hangar.capacite,
    capacite_max: 20,
    places_disponibles: 20 - hangar.capacite,
    prix_par_place: prixParPlace,
  });
}
