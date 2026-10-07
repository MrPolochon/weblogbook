export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { canAccessSiavi } from '@/lib/siavi/permissions';
import { afisAvailable, planAtAirport } from '@/lib/siavi/service-rules';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    if (!(await canAccessSiavi(admin, user.id))) {
      return NextResponse.json({ error: 'Espace SIAVI en cours de maintenance.' }, { status: 503 });
    }

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

    // Récupérer le plan
    const { data: plan, error: planError } = await admin.from('plans_vol')
      .select('id, statut, automonitoring, current_afis_user_id, current_holder_user_id, aeroport_depart, aeroport_arrivee')
      .eq('id', plan_id)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan de vol introuvable' }, { status: 404 });
    }

    if (action === 'prendre') {
      if (!planAtAirport(plan,afisSession.aeroport)) return NextResponse.json({ error: 'Ce vol ne concerne pas votre aéroport.' },{status:403});
      if (!['accepte','en_cours','automonitoring','en_attente_cloture'].includes(plan.statut)) return NextResponse.json({ error: 'Ce vol ne peut plus être surveillé.' },{status:409});
      const { data: atcs, error: atcError } = await admin.from('atc_sessions').select('aeroport').eq('aeroport',afisSession.aeroport);
      if (atcError) return NextResponse.json({ error: 'Disponibilité ATC inconnue' },{status:503});
      if (!afisAvailable(afisSession.aeroport,(atcs || []).map(a => a.aeroport))) return NextResponse.json({ error: 'Un ATC est présent : surveillance AFIS suspendue.' },{status:409});
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
      const { data: claimed, error: updateError } = await admin.from('plans_vol')
        .update({ current_afis_user_id: user.id })
        .eq('id', plan_id).is('current_afis_user_id',null).is('current_holder_user_id',null).eq('automonitoring',true).eq('statut',plan.statut).select('id').maybeSingle();

      if (updateError) {
        console.error('Erreur prise vol AFIS:', updateError);
        return NextResponse.json({ error: 'Erreur lors de la prise en charge' }, { status: 500 });
      }

      if (!claimed) return NextResponse.json({ error: 'Ce vol a déjà été pris ou modifié.' },{status:409});
      return NextResponse.json({ ok: true, action: 'pris' });
    }

    if (action === 'relacher') {
      // Renvoyer le vol en autosurveillance (sans surveillance AFIS)
      if (plan.current_afis_user_id !== user.id) {
        return NextResponse.json({ error: 'Ce vol n\'est pas sous votre surveillance' }, { status: 403 });
      }

      const { error: updateError } = await admin.from('plans_vol')
        .update({ current_afis_user_id: null })
        .eq('id', plan_id).eq('current_afis_user_id',user.id);

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
