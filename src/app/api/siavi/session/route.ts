export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { canAccessSiavi } from '@/lib/siavi/permissions';
import { afisAvailable } from '@/lib/siavi/service-rules';

// Aéroports exclusivement SIAVI
const AEROPORTS_SIAVI_EXCLUSIFS = new Set(['IBTH', 'IJAF', 'IBAR', 'IHEN', 'IDCS', 'ILKL', 'ISCM']);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const adminGate = createAdminClient();
    if (!(await canAccessSiavi(adminGate, user.id))) {
      return NextResponse.json({ error: 'Espace SIAVI en cours de maintenance.' }, { status: 503 });
    }

    const body = await request.json();
    const { aeroport, mode = 'pompier' } = body;

    if (typeof aeroport !== 'string' || !CODES_OACI_VALIDES.has(aeroport.toUpperCase()) || !['pompier', 'afis'].includes(mode)) {
      return NextResponse.json({ error: 'Aéroport invalide' }, { status: 400 });
    }

    const apt = aeroport.toUpperCase();
    const admin = createAdminClient();

    // Vérifier si déjà en service
    const { data: existingSession } = await supabase.from('afis_sessions').select('id').eq('user_id', user.id).single();
    if (existingSession) {
      return NextResponse.json({ error: 'Vous êtes déjà en service' }, { status: 400 });
    }

    // Déterminer si l'AFIS aura les fonctions AFIS ou sera simple pompier
    let estAfis = true;

    // Sur les aéroports SIAVI exclusifs, toujours AFIS
    if (AEROPORTS_SIAVI_EXCLUSIFS.has(apt)) {
      estAfis = true;
    } else {
      // Sur les autres aéroports, AFIS seulement si pas d'ATC en ligne
      const { data: atcSession, error: atcError } = await admin.from('atc_sessions')
        .select('id')
        .eq('aeroport', apt)
        .limit(1)
        .maybeSingle();
      if (atcError) return NextResponse.json({ error: 'Disponibilité ATC inconnue. Réessayez.' },{status:503});
      
      estAfis = !atcSession;
    }

    if (mode === 'pompier') estAfis = false;
    else if (!estAfis) return NextResponse.json({ error: 'Un ATC est présent : prenez le service en mode Pompier.' }, { status: 409 });
    // Créer la session AFIS
    const { error: insertError } = await admin.from('afis_sessions').insert({
      user_id: user.id,
      aeroport: apt,
      est_afis: estAfis,
    });

    if (insertError) {
      console.error('Erreur création session AFIS:', insertError);
      return NextResponse.json({ error: 'Erreur lors de la mise en service' }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      aeroport: apt, 
      est_afis: estAfis,
      message: estAfis ? 'Fonctions AFIS actives' : 'Mode Pompier (ATC présent)'
    });
  } catch (err) {
    console.error('Erreur session SIAVI POST:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();

    // Récupérer les plans surveillés par cet AFIS et les remettre en autosurveillance
    const { error: releaseError } = await admin.from('plans_vol')
      .update({ current_afis_user_id: null })
      .eq('current_afis_user_id', user.id);
    if (releaseError) return NextResponse.json({ error: 'Impossible de libérer les vols. Votre service est conservé.' }, { status: 503 });

    // Supprimer la session
    const { error } = await admin.from('afis_sessions').delete().eq('user_id', user.id);
    
    if (error) {
      console.error('Erreur suppression session AFIS:', error);
      return NextResponse.json({ error: 'Erreur lors de la déconnexion' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Erreur session SIAVI DELETE:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await canAccessSiavi(admin, user.id))) return NextResponse.json({ error: 'Accès SIAVI indisponible' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!['afis', 'pompier'].includes(body.mode)) return NextResponse.json({ error: 'Mode invalide' }, { status: 400 });
  const { data: session, error } = await admin.from('afis_sessions').select('id,aeroport,est_afis').eq('user_id', user.id).maybeSingle();
  if (error) return NextResponse.json({ error: 'Service indisponible' }, { status: 503 });
  if (!session) return NextResponse.json({ error: 'Prenez votre service avant de changer de mode.' }, { status: 409 });
  const { data: atcs, error: atcError } = await admin.from('atc_sessions').select('aeroport').eq('aeroport',session.aeroport);
  if (atcError) return NextResponse.json({ error: 'Disponibilité ATC inconnue' }, { status: 503 });
  if (body.mode === 'afis' && !afisAvailable(session.aeroport,(atcs || []).map(a => a.aeroport))) return NextResponse.json({ error: 'Un ATC est présent : restez en mode Pompier.' }, { status: 409 });
  if (body.mode === 'pompier') {
    const { count, error: plansError } = await admin.from('plans_vol').select('id',{count:'exact',head:true}).eq('current_afis_user_id',user.id);
    if (plansError) return NextResponse.json({ error: 'Impossible de vérifier vos vols.' },{status:503});
    if (count) return NextResponse.json({ error: 'Relâchez vos vols AFIS avant de passer en mode Pompier.' },{status:409});
  }
  const { data: updated, error: updateError } = await admin.from('afis_sessions').update({est_afis:body.mode==='afis'}).eq('id',session.id).eq('est_afis',session.est_afis).select('id').maybeSingle();
  if (updateError || !updated) return NextResponse.json({ error: 'Le service a changé. Actualisez la page.' },{status:409});
  return NextResponse.json({ok:true});
}
