import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

// Aéroports exclusivement SIAVI
const AEROPORTS_SIAVI_EXCLUSIFS = new Set(['IBTH', 'IJAF', 'IBAR', 'IHEN', 'IDCS', 'ILKL', 'ISCM']);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, siavi').eq('id', user.id).single();
    const canSiavi = profile?.role === 'admin' || Boolean(profile?.siavi);
    if (!canSiavi) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { aeroport } = body;

    if (!aeroport || !CODES_OACI_VALIDES.has(aeroport.toUpperCase())) {
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
      const { data: atcSession } = await admin.from('atc_sessions')
        .select('id')
        .eq('aeroport', apt)
        .limit(1)
        .maybeSingle();
      
      estAfis = !atcSession;
    }

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
    await admin.from('plans_vol')
      .update({ current_afis_user_id: null })
      .eq('current_afis_user_id', user.id);

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
