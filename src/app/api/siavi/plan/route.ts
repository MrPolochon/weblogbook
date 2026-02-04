import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, siavi').eq('id', user.id).single();
    const canSiavi = profile?.role === 'admin' || Boolean(profile?.siavi);
    if (!canSiavi) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    // Vérifier que l'AFIS est en service avec fonctions AFIS
    const { data: afisSession } = await supabase.from('afis_sessions')
      .select('id, aeroport, est_afis')
      .eq('user_id', user.id)
      .single();

    if (!afisSession) {
      return NextResponse.json({ error: 'Vous devez être en service' }, { status: 403 });
    }

    if (!afisSession.est_afis) {
      return NextResponse.json({ error: 'Vous êtes en mode Pompier. Fonctions AFIS non disponibles.' }, { status: 403 });
    }

    const body = await request.json();
    const { action, plan_id } = body;

    if (!plan_id) {
      return NextResponse.json({ error: 'ID du plan requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer le plan
    const { data: plan, error: planError } = await admin.from('plans_vol')
      .select('id, statut, automonitoring, current_afis_user_id, current_holder_user_id')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan de vol introuvable' }, { status: 404 });
    }

    if (action === 'prendre') {
      // Prendre un vol en autosurveillance
      if (!plan.automonitoring) {
        return NextResponse.json({ error: 'Ce vol n\'est pas en autosurveillance' }, { status: 400 });
      }

      if (plan.current_holder_user_id) {
        return NextResponse.json({ error: 'Ce vol est déjà contrôlé par un ATC' }, { status: 400 });
      }

      if (plan.current_afis_user_id && plan.current_afis_user_id !== user.id) {
        return NextResponse.json({ error: 'Ce vol est déjà surveillé par un autre AFIS' }, { status: 400 });
      }

      // Prendre le vol
      const { error: updateError } = await admin.from('plans_vol')
        .update({ current_afis_user_id: user.id })
        .eq('id', plan_id);

      if (updateError) {
        console.error('Erreur prise vol AFIS:', updateError);
        return NextResponse.json({ error: 'Erreur lors de la prise en charge' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, action: 'pris' });
    }

    if (action === 'relacher') {
      // Renvoyer le vol en autosurveillance (sans surveillance AFIS)
      if (plan.current_afis_user_id !== user.id) {
        return NextResponse.json({ error: 'Ce vol n\'est pas sous votre surveillance' }, { status: 403 });
      }

      const { error: updateError } = await admin.from('plans_vol')
        .update({ current_afis_user_id: null })
        .eq('id', plan_id);

      if (updateError) {
        console.error('Erreur relâchement vol AFIS:', updateError);
        return NextResponse.json({ error: 'Erreur lors du relâchement' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, action: 'relaché' });
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
  } catch (err) {
    console.error('Erreur SIAVI plan PATCH:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
