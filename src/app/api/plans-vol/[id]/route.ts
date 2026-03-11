import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';
import { calculerUsureVol } from '@/lib/compagnie-utils';
import { envoyerChequesVol, finaliserCloturePlan, parseStripATD } from '@/lib/plans-vol/closure';

const STATUTS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];
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
    const { data: plan, error: planError } = await admin.from('plans_vol')
      .select('id, pilote_id, statut, current_holder_user_id, current_holder_position, current_holder_aeroport, automonitoring, pending_transfer_aeroport, pending_transfer_position, pending_transfer_at, vol_commercial, compagnie_id, revenue_brut, salaire_pilote, temps_prev_min, accepted_at, created_at, numero_vol, aeroport_arrivee, type_vol, demande_cloture_at, vol_sans_atc, nature_transport, type_cargaison, type_cargaison_libelle, compagnie_avion_id, aeroport_depart, nb_pax_genere, cargo_kg_genere, vol_ferry, location_loueur_compagnie_id, location_pourcentage_revenu_loueur, location_prix_journalier, location_id, strip_atd, created_by_atc, current_afis_user_id')
      .eq('id', id)
      .single();
    if (planError) {
      if (planError.code === 'PGRST116') return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });
      console.error('[plans-vol PATCH]', planError);
      return NextResponse.json({ error: planError.message || 'Erreur lors de la récupération du plan.' }, { status: 500 });
    }
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
      let holderActif = false;
      if (plan.current_holder_user_id) {
        const { data: holderSession } = await admin.from('atc_sessions')
          .select('id')
          .eq('user_id', plan.current_holder_user_id)
          .maybeSingle();
        holderActif = Boolean(holderSession);
      }
      const pasAtcAssigne = !plan.current_holder_user_id || !holderActif;
      const closDirect = enAutoSurveillanceActive || (pasAtcAssigne && planAccepte);
      
      const demandeClotureAt = new Date();
      const newStatut = closDirect ? 'cloture' : 'en_attente_cloture';

      // Verrouillage atomique : update conditionnel sur le statut actuel pour éviter les doubles traitements
      const lockUpdate = closDirect
        ? { statut: 'cloture' as const, demande_cloture_at: demandeClotureAt.toISOString(), cloture_at: demandeClotureAt.toISOString() }
        : { statut: 'en_attente_cloture' as const, demande_cloture_at: demandeClotureAt.toISOString() };
      const { data: locked, error: lockErr } = await admin.from('plans_vol')
        .update(lockUpdate)
        .eq('id', id)
        .eq('statut', plan.statut)
        .select('id');
      if (lockErr || !locked || locked.length === 0) {
        return NextResponse.json({ error: 'Clôture déjà en cours ou statut modifié.' }, { status: 409 });
      }
      
      let paiementResult = null;
      let usureAppliquee = 0;
      
      if (closDirect) {
        paiementResult = await envoyerChequesVol(admin, { ...plan, demande_cloture_at: demandeClotureAt.toISOString() }, demandeClotureAt);
        if (!paiementResult.success) {
          console.error('Erreur paiement vol:', paiementResult.message);
        }
        
        if (plan.compagnie_avion_id) {
          const { data: avion } = await admin
            .from('compagnie_avions')
            .select('id, usure_percent')
            .eq('id', plan.compagnie_avion_id)
            .single();
          
          if (avion) {
            let tempsReelMin = plan.temps_prev_min;
            if (plan.accepted_at) {
              const acceptedAt = new Date(plan.accepted_at);
              const departureTime = parseStripATD(plan.strip_atd, acceptedAt) || acceptedAt;
              const diffMs = demandeClotureAt.getTime() - departureTime.getTime();
              tempsReelMin = Math.max(1, Math.round(diffMs / 60000));
            }
            
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

      return NextResponse.json({ ok: true, statut: newStatut, direct: closDirect, paiement: paiementResult, usure_appliquee: usureAppliquee });
    }

    if (action === 'confirmer_cloture') {
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      
      // Si le holder est hors ligne, n'importe quel ATC en service peut confirmer
      let holderEnLigne = false;
      if (plan.current_holder_user_id) {
        const { data: holderSession } = await admin.from('atc_sessions')
          .select('id')
          .eq('user_id', plan.current_holder_user_id)
          .maybeSingle();
        holderEnLigne = Boolean(holderSession);
      }
      const isAtc = profile?.role === 'atc' || Boolean(profile?.atc);
      const canAtc = isAdmin || isHolder || (isAtc && !holderEnLigne);
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui detient le plan ou un admin peut confirmer la cloture.' }, { status: 403 });
      if (plan.statut !== 'en_attente_cloture') return NextResponse.json({ error: 'Aucune demande de cloture en attente.' }, { status: 400 });

      // Verrouillage atomique : passer directement à 'cloture' pour éviter les doubles clôtures
      const { data: locked, error: lockErr } = await admin.from('plans_vol')
        .update({ statut: 'cloture' })
        .eq('id', id)
        .eq('statut', 'en_attente_cloture')
        .select('id');
      if (lockErr || !locked || locked.length === 0) {
        return NextResponse.json({ error: 'Clôture déjà en cours ou terminée.' }, { status: 409 });
      }

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

      const { data: acceptLocked, error: acceptLockErr } = await admin.from('plans_vol')
        .update({ statut: 'accepte', accepted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('statut', plan.statut)
        .select('id');
      if (acceptLockErr || !acceptLocked || acceptLocked.length === 0) {
        return NextResponse.json({ error: 'Plan déjà traité.' }, { status: 409 });
      }
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

      const { data: refuseLocked, error: refuseLockErr } = await admin.from('plans_vol')
        .update({ statut: 'refuse', refusal_reason: reason })
        .eq('id', id)
        .eq('statut', plan.statut)
        .select('id');
      if (refuseLockErr || !refuseLocked || refuseLocked.length === 0) {
        return NextResponse.json({ error: 'Plan déjà traité.' }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'annuler') {
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isAtc = profile?.role === 'atc' || Boolean(profile?.atc);
      const isManualStrip = Boolean(plan.created_by_atc) && !plan.pilote_id;
      const isHolder = plan.current_holder_user_id === user.id;
      const isPiloteOwner = plan.pilote_id === user.id;

      if (plan.statut === 'cloture') return NextResponse.json({ error: 'Un plan de vol cloture ne peut pas etre annule.' }, { status: 400 });

      const aeroportDepart = plan.aeroport_depart || '';
      const rembourserPaxEtCargo = async () => {
        if (!plan.vol_commercial || !aeroportDepart) return;
        if (plan.nb_pax_genere && plan.nb_pax_genere > 0) {
          const { data: currentPax } = await admin.from('aeroport_passagers').select('passagers_disponibles, passagers_max').eq('code_oaci', aeroportDepart).single();
          if (currentPax) {
            const maxValue = currentPax.passagers_max ?? currentPax.passagers_disponibles;
            const newValue = Math.min(maxValue, currentPax.passagers_disponibles + plan.nb_pax_genere);
            await admin.from('aeroport_passagers').update({ passagers_disponibles: newValue, updated_at: new Date().toISOString() }).eq('code_oaci', aeroportDepart);
          }
        }
        const hasCargo = plan.cargo_kg_genere && plan.cargo_kg_genere > 0 && (plan.nature_transport === 'cargo' || plan.nature_transport === 'passagers');
        if (hasCargo) {
          const { data: currentCargo } = await admin.from('aeroport_cargo').select('cargo_disponible, cargo_max').eq('code_oaci', aeroportDepart).single();
          if (currentCargo) {
            const maxValue = currentCargo.cargo_max ?? currentCargo.cargo_disponible;
            const newValue = Math.min(maxValue, currentCargo.cargo_disponible + (plan.cargo_kg_genere ?? 0));
            await admin.from('aeroport_cargo').update({ cargo_disponible: newValue, updated_at: new Date().toISOString() }).eq('code_oaci', aeroportDepart);
          }
        }
      };
      const remettreAvionAuSol = () => {
        if (plan.compagnie_avion_id) {
          return admin.from('compagnie_avions').update({ statut: 'ground', aeroport_actuel: plan.aeroport_depart || undefined }).eq('id', plan.compagnie_avion_id);
        }
      };

      if (isAdmin || isAtc) {
        await rembourserPaxEtCargo();
        await remettreAvionAuSol();
        const { error } = await admin.from('plans_vol').delete().eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, deleted: true });
      }
      if (isManualStrip && (isHolder || isAdmin)) {
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
        return NextResponse.json({ ok: true });
      }
      if (isPiloteOwner && ['depose', 'en_attente', 'refuse'].includes(plan.statut)) {
        await rembourserPaxEtCargo();
        await remettreAvionAuSol();
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
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: 'Annulation non autorisee (pilote : depose/en attente/refuse uniquement ; ATC/admin : tout plan non cloture).' }, { status: 403 });
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
          strip_zone: null,
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
          strip_zone: null,
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
        strip_zone: null,
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // ============================================================
    // CLÔTURE FORCÉE PAR ADMIN
    // < 24h : clôture + amende 50 000 F$
    // >= 24h : annulation + amende 100 000 F$
    // ============================================================
    if (action === 'cloture_forcee') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
      if (plan.statut === 'cloture' || plan.statut === 'annule') return NextResponse.json({ error: 'Ce plan est déjà clôturé ou annulé.' }, { status: 400 });

      const now = new Date();
      const refDate = plan.accepted_at || plan.created_at;
      const ageMs = now.getTime() - new Date(refDate).getTime();
      const isOver24h = ageMs > 24 * 3600000;
      const AMENDE = isOver24h ? 100000 : 50000;
      const newStatut = isOver24h ? 'annule' : 'cloture';
      let amendeAppliquee = false;
      let compteDebiteVban = '';

      // 1) Trouver le compte à débiter : compte entreprise (si vol commercial) ou perso du pilote
      let compteId: string | null = null;
      if (plan.vol_commercial && plan.compagnie_id) {
        const { data: compteComp } = await admin.from('felitz_comptes')
          .select('id, solde, vban').eq('compagnie_id', plan.compagnie_id).eq('type', 'entreprise').single();
        if (compteComp) {
          compteId = compteComp.id;
          compteDebiteVban = compteComp.vban;
          await admin.rpc('debiter_compte_safe', { p_compte_id: compteComp.id, p_montant: AMENDE });
          await admin.from('felitz_transactions').insert({ compte_id: compteComp.id, type: 'debit', montant: AMENDE, libelle: `Amende ${isOver24h ? 'annulation' : 'clôture'} forcée — Plan ${plan.numero_vol}` });
          amendeAppliquee = true;
        }
      }
      if (!amendeAppliquee) {
        const { data: comptePerso } = await admin.from('felitz_comptes')
          .select('id, solde, vban').eq('proprietaire_id', plan.pilote_id).eq('type', 'personnel').single();
        if (comptePerso) {
          compteId = comptePerso.id;
          compteDebiteVban = comptePerso.vban;
          await admin.rpc('debiter_compte_safe', { p_compte_id: comptePerso.id, p_montant: AMENDE });
          await admin.from('felitz_transactions').insert({ compte_id: comptePerso.id, type: 'debit', montant: AMENDE, libelle: `Amende ${isOver24h ? 'annulation' : 'clôture'} forcée — Plan ${plan.numero_vol}` });
          amendeAppliquee = true;
        }
      }

      // 2) Mettre à jour le statut du plan de vol
      await admin.from('plans_vol').update({
        statut: newStatut,
        cloture_at: now.toISOString(),
        current_holder_user_id: null,
        current_holder_position: null,
        current_holder_aeroport: null,
        automonitoring: false,
        pending_transfer_aeroport: null,
        pending_transfer_position: null,
        pending_transfer_at: null,
      }).eq('id', id);

      // 3) Remettre l'avion au sol si utilisé
      if (plan.compagnie_avion_id) {
        await admin.from('compagnie_avions').update({
          statut: 'ground',
          aeroport_actuel: plan.aeroport_arrivee || plan.aeroport_depart,
        }).eq('id', plan.compagnie_avion_id);
      }

      // 4) Restituer les passagers/cargo consommés (vol non complété)
      const aeroportDepart = plan.aeroport_depart || '';
      if (plan.vol_commercial && aeroportDepart) {
        if (plan.nature_transport === 'passagers' && plan.nb_pax_genere && plan.nb_pax_genere > 0) {
          const { data: currentPax } = await admin.from('aeroport_passagers').select('passagers_disponibles, passagers_max').eq('code_oaci', aeroportDepart).single();
          if (currentPax) {
            await admin.from('aeroport_passagers').update({ passagers_disponibles: Math.min(currentPax.passagers_max ?? 999999, currentPax.passagers_disponibles + plan.nb_pax_genere) }).eq('code_oaci', aeroportDepart);
          }
        }
        if (plan.nature_transport === 'cargo' && plan.cargo_kg_genere && plan.cargo_kg_genere > 0) {
          const { data: currentCargo } = await admin.from('aeroport_cargo').select('cargo_disponible, cargo_max').eq('code_oaci', aeroportDepart).single();
          if (currentCargo) {
            await admin.from('aeroport_cargo').update({ cargo_disponible: Math.min(currentCargo.cargo_max ?? 999999, currentCargo.cargo_disponible + plan.cargo_kg_genere) }).eq('code_oaci', aeroportDepart);
          }
        }
      }

      // 5) Envoyer un message au pilote
      const actionLabel = isOver24h ? 'annulé de force' : 'clôturé de force';
      await admin.from('messages').insert({
        destinataire_id: plan.pilote_id,
        titre: `⚠️ Plan ${plan.numero_vol} ${actionLabel}`,
        contenu: `Votre plan de vol ${plan.numero_vol} (${plan.aeroport_depart} → ${plan.aeroport_arrivee}) a été ${actionLabel} par un administrateur.\n\nUne amende de ${AMENDE.toLocaleString('fr-FR')} F$ a été prélevée sur votre compte${plan.vol_commercial ? ' entreprise' : ' personnel'}.\n\nVeuillez clôturer vos plans de vol en temps voulu.`,
        type_message: 'systeme',
        expediteur_id: user.id,
      });

      return NextResponse.json({ ok: true, amende: AMENDE, amendeAppliquee, compteDebite: compteDebiteVban, statut: newStatut, annule: isOver24h });
    }

    if (action === 'update_strip') {
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const canAtc = isAdmin || profile?.role === 'atc' || Boolean(profile?.atc);
      if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

      const allowedFields = ['strip_atd', 'strip_rwy', 'strip_fl', 'strip_fl_unit', 'strip_sid_atc', 'strip_star', 'strip_route', 'strip_note_1', 'strip_note_2', 'strip_note_3', 'strip_zone', 'strip_order'];
      const manualOnlyFields = ['numero_vol', 'aeroport_depart', 'aeroport_arrivee', 'type_vol', 'strip_pilote_text', 'strip_type_wake'];

      const hasManualFields = manualOnlyFields.some((f) => body[f] !== undefined);
      let isManualStrip = false;
      if (hasManualFields) {
        const { data: planCheck } = await admin.from('plans_vol').select('created_by_atc, pilote_id').eq('id', id).single();
        isManualStrip = Boolean(planCheck?.created_by_atc) && !planCheck?.pilote_id;
        if (!isManualStrip) {
          return NextResponse.json({ error: 'Ces champs ne sont modifiables que sur les strips manuels.' }, { status: 403 });
        }
      }

      const effectiveFields = isManualStrip ? [...allowedFields, ...manualOnlyFields] : allowedFields;
      const update: Record<string, unknown> = {};
      for (const field of effectiveFields) {
        if (body[field] !== undefined) {
          update[field] = body[field] === '' ? null : body[field];
        }
      }
      if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Aucun champ strip à mettre à jour.' }, { status: 400 });

      // Quand strip_atd est modifié, mettre à jour heure_depart_reelle pour cohérence (IFSA, stats avion)
      if (update.strip_atd !== undefined) {
        const stripAtd = update.strip_atd as string | null;
        if (stripAtd && String(stripAtd).trim()) {
          const refDate = plan.accepted_at ? new Date(plan.accepted_at) : new Date(plan.created_at);
          const depTime = parseStripATD(stripAtd, refDate);
          update.heure_depart_reelle = depTime ? depTime.toISOString() : null;
        } else {
          update.heure_depart_reelle = null;
        }
      }

      const { error: err } = await admin.from('plans_vol').update(update).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'reorder_strips') {
      const { data: profile } = await supabase.from('profiles').select('role, atc').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const canAtc = isAdmin || profile?.role === 'atc' || Boolean(profile?.atc);
      if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

      const { strips } = body; // Array of { id, strip_zone, strip_order }
      if (!Array.isArray(strips)) return NextResponse.json({ error: 'Format invalide.' }, { status: 400 });

      for (const s of strips) {
        if (!s.id) continue;
        await admin.from('plans_vol').update({
          strip_zone: s.strip_zone || null,
          strip_order: s.strip_order ?? 0,
        }).eq('id', s.id);
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
