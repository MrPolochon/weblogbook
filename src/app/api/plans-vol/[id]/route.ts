import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { ATC_POSITIONS } from '@/lib/atc-positions';

const STATUTS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring'];

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
    const { data: plan } = await admin.from('plans_vol').select('id, pilote_id, statut, current_holder_user_id, automonitoring').eq('id', id).single();
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

      const { error } = await supabase.from('plans_vol').update({ statut: newStatut }).eq('id', id);
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

      const { error } = await supabase.from('plans_vol').update({ statut: 'cloture' }).eq('id', id);
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

      const { error } = await supabase.from('plans_vol').update({ statut: 'accepte' }).eq('id', id);
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

      const { error } = await supabase.from('plans_vol').update({ statut: 'refuse', refusal_reason: reason }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
      const { error: err } = await supabase.from('plans_vol').update({ instructions: instructions.trim() || null }).eq('id', id);
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
      if (plan.statut !== 'accepte' && plan.statut !== 'en_cours' && !plan.automonitoring) return NextResponse.json({ error: 'Plan non accepté, non en cours ou non en autosurveillance.' }, { status: 400 });
      // En autosurveillance : seuls les ATC en service (avec une position) peuvent prendre/transférer
      if (plan.automonitoring && !isAdmin) {
        const { data: atcSess } = await supabase.from('atc_sessions').select('id').eq('user_id', user.id).single();
        if (!atcSess) return NextResponse.json({ error: 'Mettez-vous en service pour prendre ou transférer un plan en autosurveillance.' }, { status: 403 });
      }

      if (body.automonitoring === true) {
        const { error: err } = await supabase.from('plans_vol').update({
          current_holder_user_id: null,
          current_holder_position: null,
          current_holder_aeroport: null,
          automonitoring: true,
        }).eq('id', id);
        if (err) return NextResponse.json({ error: err.message }, { status: 400 });
        return NextResponse.json({ ok: true });
      }

      const aeroport = String(body.aeroport || '').toUpperCase();
      const position = body.position;
      if (!aeroport || !position) return NextResponse.json({ error: 'Aéroport et position requis (ou automonitoring: true).' }, { status: 400 });
      if (!CODES_OACI_VALIDES.has(aeroport)) return NextResponse.json({ error: 'Aéroport invalide.' }, { status: 400 });
      if (!(ATC_POSITIONS as readonly string[]).includes(String(position))) return NextResponse.json({ error: 'Position invalide.' }, { status: 400 });

      const { data: sess } = await admin.from('atc_sessions').select('user_id').eq('aeroport', aeroport).eq('position', String(position)).single();
      if (!sess?.user_id) return NextResponse.json({ error: 'Aucun ATC en ligne à cette position pour cet aéroport.' }, { status: 400 });

      const { error: err } = await supabase.from('plans_vol').update({
        current_holder_user_id: sess.user_id,
        current_holder_position: String(position),
        current_holder_aeroport: aeroport,
        automonitoring: false,
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
