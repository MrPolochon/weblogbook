import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || profile?.atc;
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    const body = await request.json();
    const { aeroport, position } = body;
    const ap = String(aeroport || '').toUpperCase();
    if (!CODES_OACI_VALIDES.has(ap)) return NextResponse.json({ error: 'Aéroport invalide.' }, { status: 400 });
    if (!position || !(ATC_POSITIONS as readonly string[]).includes(String(position))) {
      return NextResponse.json({ error: 'Position invalide (Delivery, Clairance, Ground, Tower, APP, DEP, Center).' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing } = await admin.from('atc_sessions').select('id').eq('aeroport', ap).eq('position', position).single();
    if (existing) return NextResponse.json({ error: 'Position déjà prise.' }, { status: 400 });

    const { data: mySession } = await supabase.from('atc_sessions').select('id').eq('user_id', user.id).single();
    if (mySession) return NextResponse.json({ error: 'Vous avez déjà une session. Mettez-vous hors service d\'abord.' }, { status: 400 });

    const { error } = await supabase.from('atc_sessions').insert({ user_id: user.id, aeroport: ap, position: String(position) });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('ATC session POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { count } = await admin.from('plans_vol').select('*', { count: 'exact', head: true }).eq('current_holder_user_id', user.id).in('statut', ['en_attente', 'en_cours', 'accepte', 'en_attente_cloture']);
    if ((count ?? 0) > 0) return NextResponse.json({ error: 'Vous avez des plans de vol. Transférez-les ou clôturez-les avant de vous mettre hors service.' }, { status: 400 });

    const { data: session } = await supabase.from('atc_sessions').select('id, started_at, aeroport, position').eq('user_id', user.id).single();
    if (!session) return NextResponse.json({ error: 'Aucune session active.' }, { status: 400 });

    // Mettre à jour le temps total de service
    if (session.started_at) {
      const durationMinutes = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60_000));
      const { data: prof } = await supabase.from('profiles').select('atc_temps_total_minutes').eq('id', user.id).single();
      const prev = (prof?.atc_temps_total_minutes ?? 0) | 0;
      await supabase.from('profiles').update({ atc_temps_total_minutes: prev + durationMinutes }).eq('id', user.id);
    }

    // Récupérer et traiter les taxes accumulées pendant cette session
    const { data: taxesPending } = await admin.from('atc_taxes_pending')
      .select('id, montant, aeroport, description, plan_vol_id')
      .eq('session_id', session.id);

    let chequeMontant = 0;
    let chequeEnvoye = false;

    if (taxesPending && taxesPending.length > 0) {
      // Calculer le total des taxes
      chequeMontant = taxesPending.reduce((sum, t) => sum + (t.montant || 0), 0);

      if (chequeMontant > 0) {
        // Récupérer le compte personnel de l'ATC
        const { data: compteAtc } = await admin.from('felitz_comptes')
          .select('id')
          .eq('proprietaire_id', user.id)
          .eq('type', 'personnel')
          .single();

        if (compteAtc) {
          // Construire le détail des vols
          const nbVols = taxesPending.length;
          const aeroportsConcernes = [...new Set(taxesPending.map(t => t.aeroport))].join(', ');
          
          // Envoyer un seul chèque avec le total
          await admin.from('messages').insert({
            destinataire_id: user.id,
            expediteur_id: null,
            titre: `Salaire ATC - ${session.aeroport} ${session.position}`,
            contenu: `Fin de votre service sur ${session.aeroport} - ${session.position}.\n\nVous avez contrôlé ${nbVols} vol(s) sur les aéroports: ${aeroportsConcernes}.\n\nTotal des taxes perçues: ${chequeMontant.toLocaleString('fr-FR')} F$\n\nMerci pour votre service !`,
            type_message: 'cheque_taxes_atc',
            cheque_montant: chequeMontant,
            cheque_encaisse: false,
            cheque_destinataire_compte_id: compteAtc.id,
            cheque_libelle: `Salaire ATC - ${session.aeroport} ${session.position} (${nbVols} vols)`,
            cheque_pour_compagnie: false
          });
          chequeEnvoye = true;
        }
      }

      // Supprimer les taxes pending traitées
      await admin.from('atc_taxes_pending').delete().eq('session_id', session.id);
    }

    // Supprimer la session
    const { error } = await supabase.from('atc_sessions').delete().eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    
    return NextResponse.json({ ok: true, chequeEnvoye, montant: chequeMontant });
  } catch (e) {
    console.error('ATC session DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
