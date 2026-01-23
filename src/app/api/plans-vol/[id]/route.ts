import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

const STATUTS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring'];
const ORDRE_ACCEPTATION_PLANS = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    const admin = createAdminClient();
    const { data: plan } = await admin.from('plans_vol').select('id, pilote_id, statut, current_holder_user_id, automonitoring, pending_transfer_aeroport, pending_transfer_position, pending_transfer_at, aeroport_depart, aeroport_arrivee, type_vol, temps_prev_min, vol_commercial, nature_cargo, compagnie_avion_id, numero_vol').eq('id', id).single();
    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });

    if (action === 'cloture') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Clôture réservée au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut === 'refuse' || plan.statut === 'cloture') return NextResponse.json({ error: 'Ce plan ne peut pas être clôturé.' }, { status: 400 });
      if (!STATUTS_OUVERTS.includes(plan.statut)) return NextResponse.json({ error: 'Statut invalide pour clôture.' }, { status: 400 });

      // Clôture directe si : pas de détenteur, autosurveillance, ou aucun ATC n’a encore accepté (statut ≠ accepte/en_cours)
      const closDirect = !plan.current_holder_user_id || plan.automonitoring === true || (plan.statut !== 'accepte' && plan.statut !== 'en_cours');
      const newStatut = closDirect ? 'cloture' : 'en_attente_cloture';
      
      let finances: any = {};
      if (newStatut === 'cloture' && plan.vol_commercial) {
        const { data: vol } = await admin
          .from('vols')
          .select('id, duree_minutes, depart_utc, arrivee_utc')
          .eq('plan_vol_id', id)
          .single();
        
        const { calculerFinances } = await import('@/lib/calcul-financier');
        finances = await calculerFinances(plan as any, vol);
        
        await admin.from('plans_vol').update({
          nombre_passagers: finances.nombre_passagers,
          cargo_kg: finances.cargo_kg,
          revenue_total: finances.revenue_total,
          taxes_aeroportuaires: finances.taxes_aeroportuaires,
          revenue_effectif: finances.revenue_effectif,
          salaire_pilote: finances.salaire_pilote,
        }).eq('id', id);

        if (finances.salaire_pilote > 0) {
          const { data: comptePilote } = await admin.from('felitz_comptes').select('id, solde').eq('user_id', plan.pilote_id).is('compagnie_id', null).single();
          if (comptePilote) {
            await admin.from('felitz_comptes').update({ solde: Number(comptePilote.solde) + finances.salaire_pilote }).eq('id', comptePilote.id);
            await admin.from('felitz_transactions').insert({
              compte_id: comptePilote.id,
              type: 'salaire',
              montant: finances.salaire_pilote,
              titre: 'Salaire vol',
              plan_vol_id: id,
            });
          }
        }

        if (plan.compagnie_avion_id && finances.revenue_compagnie > 0) {
          const { data: avionComp } = await admin.from('compagnies_avions').select('compagnie_id').eq('id', plan.compagnie_avion_id).single();
          if (avionComp) {
            const { data: compteComp } = await admin.from('felitz_comptes').select('id, solde').eq('compagnie_id', avionComp.compagnie_id).single();
            if (compteComp) {
              await admin.from('felitz_comptes').update({ solde: Number(compteComp.solde) + finances.revenue_compagnie }).eq('id', compteComp.id);
              await admin.from('felitz_transactions').insert({
                compte_id: compteComp.id,
                type: 'revenue_vol',
                montant: finances.revenue_compagnie,
                titre: 'Revenue vol',
                plan_vol_id: id,
              });
            }
          }
        }

        await admin.from('messages').insert({
          user_id: plan.pilote_id,
          titre: 'Vol clôturé',
          contenu: `Votre vol ${plan.numero_vol} a été clôturé.\n\nRevenue total: ${finances.revenue_total.toFixed(2)} €\nTaxes: ${finances.taxes_aeroportuaires.toFixed(2)} €\nRevenue effectif: ${finances.revenue_effectif.toFixed(2)} €\nSalaire: ${finances.salaire_pilote.toFixed(2)} €`,
          type: 'cloture_vol',
          plan_vol_id: id,
        });
      }

      const payload: { statut: string; cloture_at?: string } = { statut: newStatut };
      if (newStatut === 'cloture') {
        payload.cloture_at = new Date().toISOString();
        if (plan.compagnie_avion_id) {
          await admin.from('avions_utilisation').delete().eq('plan_vol_id', id);
        }
      }

      const { error } = await admin.from('plans_vol').update(payload).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, statut: newStatut, direct: closDirect });
    }

    if (action === 'confirmer_cloture') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l’ATC qui détient le plan ou un admin peut confirmer la clôture.' }, { status: 403 });
      if (plan.statut !== 'en_attente_cloture') return NextResponse.json({ error: 'Aucune demande de clôture en attente.' }, { status: 400 });

      let finances: any = {};
      if (plan.vol_commercial) {
        const { data: vol } = await admin
          .from('vols')
          .select('id, duree_minutes, depart_utc, arrivee_utc')
          .eq('plan_vol_id', id)
          .single();
        
        const { calculerFinances } = await import('@/lib/calcul-financier');
        finances = await calculerFinances(plan as any, vol);
        
        await admin.from('plans_vol').update({
          nombre_passagers: finances.nombre_passagers,
          cargo_kg: finances.cargo_kg,
          revenue_total: finances.revenue_total,
          taxes_aeroportuaires: finances.taxes_aeroportuaires,
          revenue_effectif: finances.revenue_effectif,
          salaire_pilote: finances.salaire_pilote,
        }).eq('id', id);

        if (finances.salaire_pilote > 0) {
          const { data: comptePilote } = await admin.from('felitz_comptes').select('id, solde').eq('user_id', plan.pilote_id).is('compagnie_id', null).single();
          if (comptePilote) {
            await admin.from('felitz_comptes').update({ solde: Number(comptePilote.solde) + finances.salaire_pilote }).eq('id', comptePilote.id);
            await admin.from('felitz_transactions').insert({
              compte_id: comptePilote.id,
              type: 'salaire',
              montant: finances.salaire_pilote,
              titre: 'Salaire vol',
              plan_vol_id: id,
            });
          }
        }

        if (plan.compagnie_avion_id && finances.revenue_compagnie > 0) {
          const { data: avionComp } = await admin.from('compagnies_avions').select('compagnie_id').eq('id', plan.compagnie_avion_id).single();
          if (avionComp) {
            const { data: compteComp } = await admin.from('felitz_comptes').select('id, solde').eq('compagnie_id', avionComp.compagnie_id).single();
            if (compteComp) {
              await admin.from('felitz_comptes').update({ solde: Number(compteComp.solde) + finances.revenue_compagnie }).eq('id', compteComp.id);
              await admin.from('felitz_transactions').insert({
                compte_id: compteComp.id,
                type: 'revenue_vol',
                montant: finances.revenue_compagnie,
                titre: 'Revenue vol',
                plan_vol_id: id,
              });
            }
          }
        }

        await admin.from('messages').insert({
          user_id: plan.pilote_id,
          titre: 'Vol clôturé',
          contenu: `Votre vol ${plan.numero_vol} a été clôturé.\n\nRevenue total: ${finances.revenue_total.toFixed(2)} €\nTaxes: ${finances.taxes_aeroportuaires.toFixed(2)} €\nRevenue effectif: ${finances.revenue_effectif.toFixed(2)} €\nSalaire: ${finances.salaire_pilote.toFixed(2)} €`,
          type: 'cloture_vol',
          plan_vol_id: id,
        });
      }

      if (plan.compagnie_avion_id) {
        await admin.from('avions_utilisation').delete().eq('plan_vol_id', id);
      }

      const { error } = await admin.from('plans_vol').update({ statut: 'cloture', cloture_at: new Date().toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'accepter') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui détient le plan ou un admin peut accepter.' }, { status: 403 });
      if (plan.statut !== 'en_attente' && plan.statut !== 'depose') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });

      const { error } = await admin.from('plans_vol').update({ statut: 'accepte', accepted_at: new Date().toISOString() }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'refuser') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      const canAtc = isAdmin || isHolder;
      if (!canAtc) return NextResponse.json({ error: 'Seul l\'ATC qui détient le plan ou un admin peut refuser.' }, { status: 403 });
      if (plan.statut !== 'en_attente' && plan.statut !== 'depose') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });
      const reason = body.refusal_reason != null ? String(body.refusal_reason).trim() : '';
      if (!reason) return NextResponse.json({ error: 'La raison du refus est obligatoire.' }, { status: 400 });

      const { error } = await admin.from('plans_vol').update({ statut: 'refuse', refusal_reason: reason }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'modifier_et_renvoyer') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role === 'atc') return NextResponse.json({ error: 'Réservé au pilote.' }, { status: 403 });
      if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan de vol ne vous appartient pas.' }, { status: 403 });
      if (plan.statut !== 'refuse') return NextResponse.json({ error: 'Seul un plan refusé peut être modifié et renvoyé.' }, { status: 400 });

      const { aeroport_depart, aeroport_arrivee, numero_vol, porte, temps_prev_min, type_vol, intentions_vol, sid_depart, star_arrivee } = body;
      const ad = String(aeroport_depart || '').toUpperCase();
      const aa = String(aeroport_arrivee || '').toUpperCase();
      if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) return NextResponse.json({ error: 'Aéroports invalides.' }, { status: 400 });
      if (!numero_vol || typeof numero_vol !== 'string' || !String(numero_vol).trim()) return NextResponse.json({ error: 'Numéro de vol requis.' }, { status: 400 });
      const t = parseInt(String(temps_prev_min), 10);
      if (isNaN(t) || t < 1) return NextResponse.json({ error: 'Temps prévu invalide (minutes ≥ 1).' }, { status: 400 });
      if (!type_vol || !['VFR', 'IFR'].includes(String(type_vol))) return NextResponse.json({ error: 'Type de vol VFR ou IFR requis.' }, { status: 400 });
      if (String(type_vol) === 'VFR' && (!intentions_vol || !String(intentions_vol).trim())) return NextResponse.json({ error: 'Intentions de vol requises pour VFR.' }, { status: 400 });
      if (String(type_vol) === 'IFR') {
        if (!sid_depart || !String(sid_depart).trim()) return NextResponse.json({ error: 'SID de départ requise pour IFR.' }, { status: 400 });
        if (!star_arrivee || !String(star_arrivee).trim()) return NextResponse.json({ error: 'STAR d\'arrivée requise pour IFR.' }, { status: 400 });
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
      if (!holder) return NextResponse.json({ error: 'Aucune fréquence ATC de votre aéroport de départ ou d\'arrivée est en ligne. Réessayez plus tard.' }, { status: 400 });

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
      }).eq('id', id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'instructions') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = profile?.role === 'admin';
      const isHolder = plan.current_holder_user_id === user.id;
      // En autosurveillance : les instructions ne sont pas modifiables
      const canEdit = (isAdmin || isHolder) && !plan.automonitoring;
      if (!canEdit) return NextResponse.json({ error: 'Seul le détenteur du plan ou un admin peut modifier les instructions (pas en autosurveillance).' }, { status: 403 });
      if (plan.statut !== 'accepte' && plan.statut !== 'en_cours') return NextResponse.json({ error: 'Plan non accepté ou non en cours.' }, { status: 400 });
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
      const canTransfer = isAdmin || isHolder || (plan.automonitoring && canAtc);
      if (!canTransfer) return NextResponse.json({ error: 'Seul le détenteur du plan, un admin, ou un ATC (si autosurveillance) peut transférer.' }, { status: 403 });
      const canTransferByStatut = ['accepte', 'en_cours'].includes(plan.statut) || plan.automonitoring
        || (['depose', 'en_attente'].includes(plan.statut) && (isHolder || isAdmin));
      if (!canTransferByStatut) return NextResponse.json({ error: 'Plan non accepté, non en cours ou non en autosurveillance.' }, { status: 400 });
      // En autosurveillance : seuls les ATC en service (avec une position) peuvent prendre/transférer
      if (plan.automonitoring && !isAdmin) {
        const { data: atcSess } = await supabase.from('atc_sessions').select('id').eq('user_id', user.id).single();
        if (!atcSess) return NextResponse.json({ error: 'Mettez-vous en service pour prendre ou transférer un plan en autosurveillance.' }, { status: 403 });
      }

      if (body.automonitoring === true) {
        if (['depose', 'en_attente'].includes(plan.statut)) return NextResponse.json({ error: 'Impossible de mettre en autosurveillance un plan non encore accepté.' }, { status: 400 });
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
      if (!aeroport || !position) return NextResponse.json({ error: 'Aéroport et position requis (ou automonitoring: true).' }, { status: 400 });
      if (!CODES_OACI_VALIDES.has(aeroport)) return NextResponse.json({ error: 'Aéroport invalide.' }, { status: 400 });
      if (!(ATC_POSITIONS as readonly string[]).includes(String(position))) return NextResponse.json({ error: 'Position invalide.' }, { status: 400 });
      if (plan.pending_transfer_aeroport != null) return NextResponse.json({ error: 'Un transfert est déjà en attente d\'acceptation. Attendez 1 min ou l\'acceptation par la position cible.' }, { status: 400 });

      const { data: sess } = await admin.from('atc_sessions').select('user_id').eq('aeroport', aeroport).eq('position', String(position)).single();
      if (!sess?.user_id) return NextResponse.json({ error: 'Aucun ATC en ligne à cette position pour cet aéroport.' }, { status: 400 });

      // Mise en attente : la position cible doit accepter sous 1 min, sinon renvoi à l'ATC d'avant
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
        return NextResponse.json({ error: 'Ce transfert ne vous est pas destiné ou a expiré.' }, { status: 403 });
      const oneMinAgo = new Date(Date.now() - 60000).toISOString();
      if (plan.pending_transfer_at && plan.pending_transfer_at < oneMinAgo) return NextResponse.json({ error: 'Ce transfert a expiré (1 min).' }, { status: 400 });

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

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (e) {
    console.error('plans-vol PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** Supprimer définitivement un plan clôturé sans l'enregistrer en vol (pilote uniquement). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: plan } = await admin.from('plans_vol').select('id, pilote_id, statut').eq('id', id).single();
    if (!plan) return NextResponse.json({ error: 'Plan de vol introuvable.' }, { status: 404 });
    if (plan.pilote_id !== user.id) return NextResponse.json({ error: 'Ce plan ne vous appartient pas.' }, { status: 403 });
    if (plan.statut !== 'cloture') return NextResponse.json({ error: 'Seul un plan clôturé peut être supprimé ainsi (ne pas enregistrer).' }, { status: 400 });

    const { error } = await admin.from('plans_vol').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('plans-vol DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
