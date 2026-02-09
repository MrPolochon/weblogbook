import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { calculerUsureVol } from '@/lib/compagnie-utils';
import { envoyerChequesVol, finaliserCloturePlan } from '@/lib/plans-vol/closure';

const STATUTS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring'];
// Ordre de priorité pour recevoir un plan de vol (départ puis arrivée)
const ORDRE_ACCEPTATION_PLANS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

/**
 * Enregistre qu'un ATC a contrôlé un plan de vol.
 */
async function enregistrerControleATC(
  admin: ReturnType<typeof createAdminClient>,
  planVolId: string,
  userId: string,
  aeroport: string,
  position: string
): Promise<void> {
  try {
    await admin.from('atc_plans_controles').upsert({
      plan_vol_id: planVolId,
      user_id: userId,
      aeroport,
      position
    }, { onConflict: 'plan_vol_id,user_id,aeroport,position' });
  } catch (e) {
    console.error('Erreur enregistrement controle ATC:', e);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    const admin = createAdminClient();
    const { data: plan } = await admin.from('plans_vol')
      .select('id, pilote_id, statut, current_holder_user_id, current_holder_position, current_holder_aeroport, automonitoring, pending_transfer_aeroport, pending_transfer_position, pending_transfer_at, vol_commercial, compagnie_id, revenue_brut, salaire_pilote, temps_prev_min, accepted_at, numero_vol, aeroport_arrivee, type_vol, demande_cloture_at, vol_sans_atc, nature_transport, type_cargaison, compagnie_avion_id, aeroport_depart, nb_pax_genere, cargo_kg_genere, vol_ferry, location_loueur_compagnie_id, location_pourcentage_revenu_loueur, location_prix_journalier, location_id')
      .eq('id', id)
      .single();
    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });

    if (action === 'cloture') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Cloture reservee au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut === 'refuse' || plan.statut === 'cloture') return NextResponse.json({ error: 'Ce plan ne peut pas etre cloture.' }, { status: 400 });
      if (!STATUTS_OUVERTS.includes(plan.statut)) return NextResponse.json({ error: 'Statut invalide pour cloture.' }, { status: 400 });

      // Vérifier que le plan a été accepté avant de permettre la clôture avec paiement
      // Exception : autosurveillance (vol sans ATC) peut être clôturé directement
      const planAccepte = plan.accepted_at !== null || plan.automonitoring === true || plan.vol_sans_atc === true;
      
      // Si le plan n'a jamais été accepté et n'est pas en autosurveillance, on ne peut pas le clôturer
      if (!planAccepte && plan.statut !== 'automonitoring') {
        return NextResponse.json({ 
          error: 'Ce plan de vol n\'a jamais été accepté par un ATC. Vous ne pouvez pas le clôturer. Contactez un administrateur si nécessaire.' 
        }, { status: 400 });
      }

      // Clôture directe uniquement si :
      // - Vol en autosurveillance active (automonitoring === true)
      // - Pas d'ATC assigné (current_holder_user_id est null)
      // 
      // Note: On ne vérifie PAS vol_sans_atc car un ATC peut avoir pris le vol après.
      // Ce qui compte c'est l'état ACTUEL : est-ce qu'un ATC contrôle le vol ?
      // 
      // Si un ATC contrôle le vol (current_holder_user_id défini et automonitoring === false), 
      // le pilote doit demander la clôture et l'ATC doit confirmer
      const enAutoSurveillanceActive = plan.automonitoring === true;
      const pasAtcAssigne = !plan.current_holder_user_id;
      const closDirect = enAutoSurveillanceActive || (pasAtcAssigne && planAccepte);
      
      const newStatut = closDirect ? 'cloture' : 'en_attente_cloture';
      const demandeClotureAt = new Date();
      const payload: { statut: string; cloture_at?: string; demande_cloture_at: string } = { 
        statut: newStatut,
        demande_cloture_at: demandeClotureAt.toISOString() // Toujours enregistrer quand le pilote demande
      };
      
      let paiementResult = null;
      let usureAppliquee = 0;
      
      if (newStatut === 'cloture') {
        payload.cloture_at = demandeClotureAt.toISOString();
        // Utiliser demande_cloture_at pour le calcul du temps réel
        paiementResult = await envoyerChequesVol(admin, { ...plan, demande_cloture_at: demandeClotureAt.toISOString() }, demandeClotureAt);
        if (!paiementResult.success) {
          console.error('Erreur paiement vol:', paiementResult.message);
        }
        
        // Appliquer l'usure à l'avion individuel si utilisé
        if (plan.compagnie_avion_id) {
          const { data: avion } = await admin
            .from('compagnie_avions')
            .select('id, usure_percent')
            .eq('id', plan.compagnie_avion_id)
            .single();
          
          if (avion) {
            // Calculer le temps réel de vol
            let tempsReelMin = plan.temps_prev_min;
            if (plan.accepted_at) {
              const acceptedAt = new Date(plan.accepted_at);
              const diffMs = demandeClotureAt.getTime() - acceptedAt.getTime();
              tempsReelMin = Math.max(1, Math.round(diffMs / 60000));
            }
            
            // Calculer et appliquer l'usure
            usureAppliquee = calculerUsureVol(tempsReelMin);
            const nouvelleUsure = Math.max(0, avion.usure_percent - usureAppliquee);
            const nouveauStatut = nouvelleUsure === 0 ? 'bloque' : 'ground';
            
            await admin
              .from('compagnie_avions')
              .update({
                usure_percent: nouvelleUsure,
                aeroport_actuel: plan.aeroport_arrivee,
                statut: nouveauStatut,
              })
              .eq('id', avion.id);
          }
        }
      }

      const { error } = await admin.from('plans_vol').update(payload).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, statut: newStatut, direct: closDirect, paiement: paiementResult, usure_appliquee: usureAppliquee });
    }

    if (action === 'confirmer_cloture') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut confirmer la cloture.' }, { status: 403 });
      if (plan.statut !== 'en_attente_cloture') return NextResponse.json({ error: 'Aucune demande de cloture en attente.' }, { status: 400 });

      const confirmationAt = new Date();
      const clotureResult = await finaliserCloturePlan(admin, plan, confirmationAt);
      if (!clotureResult.success) {
        return NextResponse.json({ error: clotureResult.error || 'Erreur cloture plan.' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, paiement: clotureResult.paiementResult, usure_appliquee: clotureResult.usureAppliquee });
    }

    if (action === 'accepter') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut accepter.' }, { status: 403 });
      if (plan.statut !== 'en_attente' && plan.statut !== 'depose') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });

      // Enregistrer que cet ATC a contrôlé ce vol
      if (plan.current_holder_user_id && plan.current_holder_aeroport && plan.current_holder_position) {
        await enregistrerControleATC(admin, id, plan.current_holder_user_id, plan.current_holder_aeroport, plan.current_holder_position);
      }

      const { error } = await admin.from('plans_vol').update({ statut: 'accepte', accepted_at: new Date().toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'refuser') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut refuser.' }, { status: 403 });
      if (plan.statut !== 'en_attente' && plan.statut !== 'depose') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });
      const reason = body.refusal_reason != null ? String(body.refusal_reason).trim() : '';
      if (!reason) return NextResponse.json({ error: 'La raison du refus est obligatoire.' }, { status: 400 });

      const { error } = await admin.from('plans_vol').update({ statut: 'refuse', refusal_reason: reason }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'modifier_et_renvoyer') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Reserve au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut !== 'refuse') return NextResponse.json({ error: 'Seul un plan refuse peut etre modifie et renvoye.' }, { status: 400 });

      const { aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, intentions_vol, sid_depart, star_arrivee, vol_sans_atc } = body;
      const ad = String(aeroport_depart || '').toUpperCase();
      const aa = String(aeroport_arrivee || '').toUpperCase();
      if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) return NextResponse.json({ error: 'Aeroports invalides.' }, { status: 400 });
      if (!numero_vol || typeof numero_vol !== 'string' || !String(numero_vol).trim()) return NextResponse.json({ error: 'Numero de vol requis.' }, { status: 400 });
      const t = parseInt(String(temps_prev_min), 10);
      if (isNaN(t) || t < 1) return NextResponse.json({ error: 'Temps prevu invalide (minutes >= 1).' }, { status: 400 });
      if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
      if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
      if (String(type_vol) === 'IFR') {
        if (!sid_depart || !String(sid_depart).trim()) return NextResponse.json({ error: 'SID de depart requise pour IFR.' }, { status: 400 });
        if (!star_arrivee || !String(star_arrivee).trim()) return NextResponse.json({ error: 'STAR d\'arrivee requise pour IFR.' }, { status: 400 });
      }

      const airportsToCheck = ad === aa ? [ad] : [ad, aa];
      let holder: { user_id: string; position: string; aeroport: string } | null = null;
      for (const apt of airportsToCheck) {
        for (const pos of ORDRE_ACCEPTATION_PLANS) {
          const { data: s } = await admin.from('atc_sessions').select('user_id').eq('aeroport', apt).eq('position', pos).single();
          if (s?.user_id) { holder = { user_id: s.user_id, position: pos, aeroport: apt }; break; }
        }
        if (holder) break;
      }

      if (!holder) {
        if (vol_sans_atc === true) {
          const { error: err } = await admin.from('plans_vol').update({
            aeroport_depart: ad,
            aeroport_arrivee: aa,
            numero_vol: String(numero_vol).trim(),
            porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
            temps_prev_min: t,
            type_vol: String(type_vol),
            intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
            sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
            star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
            statut: 'accepte',
            accepted_at: new Date().toISOString(),
            refusal_reason: null,
            instructions: null,
            current_holder_user_id: null,
            current_holder_position: null,
            current_holder_aeroport: null,
            automonitoring: true,
            vol_sans_atc: true,
            pending_transfer_aeroport: null,
            pending_transfer_position: null,
            pending_transfer_at: null,
          }).eq('id', id);
          if (err) return NextResponse.json({ error: err.message }, { status: 400 });
          return NextResponse.json({ ok: true, vol_sans_atc: true });
        }
        return NextResponse.json({ error: 'Aucune frequence ATC de votre aeroport de depart ou d\'arrivee est en ligne. Reessayez plus tard.' }, { status: 400 });
      }

      // Enregistrer le nouvel ATC qui reçoit le plan
      await enregistrerControleATC(admin, id, holder.user_id, holder.aeroport, holder.position);

      const { error: err } = await admin.from('plans_vol').update({
        aeroport_depart: ad,
        aeroport_arrivee: aa,
        numero_vol: String(numero_vol).trim(),
        porte: (porte != null && String(porte).trim() !== '') ? String(porte).trim() : null,
        temps_prev_min: t,
        type_vol: String(type_vol),
        intentions_vol: type_vol === 'VFR' ? String(intentions_vol).trim() : null,
        sid_depart: type_vol === 'IFR' ? String(sid_depart).trim() : null,
        star_arrivee: type_vol === 'IFR' ? String(star_arrivee).trim() : null,
        statut: 'en_attente',
        refusal_reason: null,
        instructions: null,
        current_holder_user_id: holder.user_id,
        current_holder_position: holder.position,
        current_holder_aeroport: holder.aeroport,
        automonitoring: false,
        vol_sans_atc: false,
        pending_transfer_aeroport: null,
        pending_transfer_position: null,
        pending_transfer_at: null,
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'instructions') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canEdit = (isAdmin || isHolder) && !plan.automonitoring;
      if (!canEdit) return NextResponse.json({ error: 'Seul le detenteur du plan ou un admin peut modifier les instructions (pas en autosurveillance).' }, { status: 403 });
      if (plan.statut !== 'accepte' && plan.statut !== 'en_cours') return NextResponse.json({ error: 'Plan non accepte ou non en cours.' }, { status: 400 });
      const instructions = body.instructions != null ? String(body.instructions) : '';
      const { error: err } = await admin.from('plans_vol').update({ instructions: instructions.trim() || null }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'transferer') {
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || profile?.role === 'atc' || Boolean(profile?.atc);
      let holderSessionActive = false;
      if (plan.current_holder_user_id) {
        const { data: holderSession } = await admin.from('atc_sessions')
          .select('id')
          .eq('user_id', plan.current_holder_user_id)
          .maybeSingle();
        holderSessionActive = Boolean(holderSession);
      }
      const planSansAtc = !plan.current_holder_user_id;
      const holderOffline = plan.current_holder_user_id && !holderSessionActive;
      const canReprendreOrphelin = canAtc && ['depose', 'en_attente'].includes(plan.statut) && (holderOffline || planSansAtc);
      const canTransfer = isAdmin || isHolder || (plan.automonitoring && canAtc) || canReprendreOrphelin;
      if (!canTransfer) return NextResponse.json({ error: 'Seul le detenteur du plan, un admin, ou un ATC (si autosurveillance) peut transferer.' }, { status: 403 });
      const canTransferByStatut = ['accepte', 'en_cours'].includes(plan.statut) || plan.automonitoring
        || (['depose', 'en_attente'].includes(plan.statut) && (isHolder || isAdmin || canReprendreOrphelin));
      if (!canTransferByStatut) return NextResponse.json({ error: 'Plan non accepte, non en cours ou non en autosurveillance.' }, { status: 400 });
      if (plan.automonitoring && !isAdmin) {
        const { data: atcSess } = await supabase.from('atc_sessions').select('id').eq('user_id', user.id).single();
        if (!atcSess) return NextResponse.json({ error: 'Mettez-vous en service pour prendre ou transferer un plan en autosurveillance.' }, { status: 403 });
      }

      if (body.automonitoring === true) {
        if (['depose', 'en_attente'].includes(plan.statut)) return NextResponse.json({ error: 'Impossible de mettre en autosurveillance un plan non encore accepte.' }, { status: 400 });
        const { error: err } = await admin.from('plans_vol').update({
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
          automonitoring: true,
          pending_transfer_aeroport: null,
          pending_transfer_position: null,
          pending_transfer_at: null,
        }).eq('id', id);
        if (err) return NextResponse.json({ error: err.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      const aeroport = String(body.aeroport || '').toUpperCase();
      const position = body.position;
      if (!aeroport || !position) return NextResponse.json({ error: 'Aeroport et position requis (ou automonitoring: true).' }, { status: 400 });
      if (!CODES_OACI_VALIDES.has(aeroport)) return NextResponse.json({ error: 'Aeroport invalide.' }, { status: 400 });
      if (!(ATC_POSITIONS as readonly string[]).includes(String(position))) return NextResponse.json({ error: 'Position invalide.' }, { status: 400 });
      if (plan.pending_transfer_aeroport != null) return NextResponse.json({ error: 'Un transfert est deja en attente d\'acceptation. Attendez 1 min ou l\'acceptation par la position cible.' }, { status: 400 });

      const { data: sess } = await admin.from('atc_sessions').select('user_id').eq('aeroport', aeroport).eq('position', String(position)).single();
      if (!sess?.user_id) return NextResponse.json({ error: 'Aucun ATC en ligne a cette position pour cet aeroport.' }, { status: 400 });

      // Si l'ATC transfère vers LUI-MÊME (sa propre session), prendre directement le plan
      if (sess.user_id === user.id) {
        // Enregistrer que cet ATC a contrôlé ce vol
        await enregistrerControleATC(admin, id, user.id, aeroport, String(position));
        
        const { error: err } = await admin.from('plans_vol').update({
          current_holder_user_id: user.id,
          current_holder_position: String(position),
          current_holder_aeroport: aeroport,
          automonitoring: false,
          pending_transfer_aeroport: null,
          pending_transfer_position: null,
          pending_transfer_at: null,
        }).eq('id', id);
        if (err) return NextResponse.json({ error: err.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      // Sinon, envoyer une demande de transfert
      const { error: err } = await admin.from('plans_vol').update({
        pending_transfer_aeroport: aeroport,
        pending_transfer_position: String(position),
        pending_transfer_at: new Date().toISOString(),
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'accepter_transfert') {
      const { data: sess } = await supabase.from('atc_sessions').select('aeroport, position').eq('user_id', user.id).single();
      if (!sess) return NextResponse.json({ error: 'Mettez-vous en service pour accepter un transfert.' }, { status: 403 });
      if (!plan.pending_transfer_aeroport || plan.pending_transfer_position !== sess.position || plan.pending_transfer_aeroport !== sess.aeroport)
        return NextResponse.json({ error: 'Ce transfert ne vous est pas destine ou a expire.' }, { status: 403 });
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      if (plan.pending_transfer_at && plan.pending_transfer_at < oneMinAgo) return NextResponse.json({ error: 'Ce transfert a expire (1 min).' }, { status: 400 });

      // Enregistrer que cet ATC a contrôlé ce vol
      await enregistrerControleATC(admin, id, user.id, sess.aeroport, sess.position);

      const { error: err } = await admin.from('plans_vol').update({
        current_holder_user_id: user.id,
        current_holder_position: sess.position,
        current_holder_aeroport: sess.aeroport,
        automonitoring: false,
        pending_transfer_aeroport: null,
        pending_transfer_position: null,
        pending_transfer_at: null,
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'annuler') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Annulation reservee au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut === 'cloture') return NextResponse.json({ error: 'Ce plan est deja cloture.' }, { status: 400 });
      if (['accepte', 'en_cours', 'en_attente_cloture'].includes(plan.statut) || plan.accepted_at) {
        return NextResponse.json({ error: 'Vous ne pouvez annuler qu\'un plan non accepte par l\'ATC.' }, { status: 400 });
      }

      const { error: err } = await admin.from('plans_vol').update({
        statut: 'annule',
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
        automonitoring: false,
        pending_transfer_aeroport: null,
        pending_transfer_position: null,
        pending_transfer_at: null,
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });

      const aeroportDepart = plan.aeroport_depart || '';

      // Rembourser les passagers/cargo si le plan était commercial
      if (plan.vol_commercial && aeroportDepart) {
        if (plan.nb_pax_genere && plan.nb_pax_genere > 0) {
          const { data: currentPax } = await admin
            .from('aeroport_passagers')
            .select('passagers_disponibles, passagers_max')
            .eq('code_oaci', aeroportDepart)
            .single();
          if (currentPax) {
            const maxValue = currentPax.passagers_max ?? currentPax.passagers_disponibles;
            const newValue = Math.min(maxValue, currentPax.passagers_disponibles + plan.nb_pax_genere);
            await admin.from('aeroport_passagers')
              .update({ passagers_disponibles: newValue, updated_at: new Date().toISOString() })
              .eq('code_oaci', aeroportDepart);
          }
        }

        if (plan.nature_transport === 'cargo' && plan.cargo_kg_genere && plan.cargo_kg_genere > 0) {
          const { data: currentCargo } = await admin
            .from('aeroport_cargo')
            .select('cargo_disponible, cargo_max')
            .eq('code_oaci', aeroportDepart)
            .single();
          if (currentCargo) {
            const maxValue = currentCargo.cargo_max ?? currentCargo.cargo_disponible;
            const newValue = Math.min(maxValue, currentCargo.cargo_disponible + plan.cargo_kg_genere);
            await admin.from('aeroport_cargo')
              .update({ cargo_disponible: newValue, updated_at: new Date().toISOString() })
              .eq('code_oaci', aeroportDepart);
          }
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (e) {
    console.error('plans-vol PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const admin = createAdminClient();
    const { data: plan } = await admin.from('plans_vol').select('id, pilote_id, statut').eq('id', id).single();
    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });
    if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan ne vous appartient pas.' }, { status: 403 });
    if (plan.statut !== 'cloture') return NextResponse.json({ error: 'Seul un plan cloture peut etre supprime ainsi (ne pas enregistrer).' }, { status: 400 });

    const { error } = await admin.from('plans_vol').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('plans-vol DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
