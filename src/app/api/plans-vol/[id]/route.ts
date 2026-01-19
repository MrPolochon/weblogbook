import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

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

      const closDirect = !plan.current_holder_user_id || plan.automonitoring === true;
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
      if (plan.statut !== 'en_attente') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });

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
      if (plan.statut !== 'en_attente') return NextResponse.json({ error: 'Ce plan n\'est pas en attente.' }, { status: 400 });
      const reason = body.refusal_reason != null ? String(body.refusal_reason).trim() : '';
      if (!reason) return NextResponse.json({ error: 'La raison du refus est obligatoire.' }, { status: 400 });

      const { error } = await supabase.from('plans_vol').update({ statut: 'refuse', refusal_reason: reason }).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (e) {
    console.error('plans-vol PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
