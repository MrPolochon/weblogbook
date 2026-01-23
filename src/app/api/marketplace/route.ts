import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('marketplace_avions')
      .select('type_avion_id, prix, capacite_cargo_kg, types_avion(nom, constructeur)')
      .order('types_avion(nom)');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Marketplace GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { type_avion_id, compagnie_id, nom_avion } = body;

    if (!type_avion_id) return NextResponse.json({ error: 'type_avion_id requis' }, { status: 400 });

    const { data: prixData } = await supabase.from('marketplace_avions').select('prix').eq('type_avion_id', type_avion_id).single();
    if (!prixData) return NextResponse.json({ error: 'Avion non disponible à la vente' }, { status: 400 });

    const prix = Number(prixData.prix);

    let compteId: string;
    if (compagnie_id) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const { data: compagnie } = await supabase.from('compagnies').select('pdg_id').eq('id', compagnie_id).single();
      if (compagnie?.pdg_id !== user.id && profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Réservé au PDG de la compagnie' }, { status: 403 });
      }

      const { data: compte } = await supabase.from('felitz_comptes').select('id, solde').eq('compagnie_id', compagnie_id).single();
      if (!compte) return NextResponse.json({ error: 'Compte entreprise introuvable' }, { status: 404 });
      if (Number(compte.solde) < prix) return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });

      compteId = compte.id;

      const admin = createAdminClient();
      await admin.from('felitz_comptes').update({ solde: Number(compte.solde) - prix }).eq('id', compteId);
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'achat_avion',
        montant: -prix,
        titre: `Achat avion ${nom_avion || 'compagnie'}`,
      });

      const { data: avionComp } = await admin.from('compagnies_avions').select('id, quantite').eq('compagnie_id', compagnie_id).eq('type_avion_id', type_avion_id).single();
      if (avionComp) {
        await admin.from('compagnies_avions').update({ quantite: avionComp.quantite + 1 }).eq('id', avionComp.id);
      } else {
        await admin.from('compagnies_avions').insert({
          compagnie_id,
          type_avion_id,
          quantite: 1,
          nom_avion: nom_avion || null,
        });
      }
    } else {
      const { data: compte } = await supabase.from('felitz_comptes').select('id, solde').eq('user_id', user.id).is('compagnie_id', null).single();
      if (!compte) return NextResponse.json({ error: 'Compte personnel introuvable' }, { status: 404 });
      if (Number(compte.solde) < prix) return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });

      compteId = compte.id;

      const admin = createAdminClient();
      await admin.from('felitz_comptes').update({ solde: Number(compte.solde) - prix }).eq('id', compteId);
      await admin.from('felitz_transactions').insert({
        compte_id: compteId,
        type: 'achat_avion',
        montant: -prix,
        titre: `Achat avion ${nom_avion || 'personnel'}`,
      });

      await admin.from('inventaire_pilote').insert({
        user_id: user.id,
        type_avion_id,
        nom_avion: nom_avion || null,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Marketplace POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
