import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Récupérer les passagers disponibles pour un aéroport
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const codeOaci = searchParams.get('code_oaci');

    const admin = createAdminClient();

    // D'abord régénérer les passagers si nécessaire
    await admin.rpc('regenerer_passagers_aeroport');

    if (codeOaci) {
      const { data, error } = await admin
        .from('aeroport_passagers')
        .select('*')
        .eq('code_oaci', codeOaci)
        .single();

      if (error) {
        // Si pas trouvé, retourner une valeur par défaut
        if (error.code === 'PGRST116') {
          return NextResponse.json({ code_oaci: codeOaci, passagers_disponibles: 5000, passagers_max: 5000 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(data);
    }

    // Retourner tous les aéroports
    const { data, error } = await admin
      .from('aeroport_passagers')
      .select('*')
      .order('code_oaci');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Aeroport passagers GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Consommer des passagers (appelé lors d'un vol)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { code_oaci, passagers_consommes } = body;

    if (!code_oaci || typeof passagers_consommes !== 'number') {
      return NextResponse.json({ error: 'Données incomplètes' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Mettre à jour les passagers disponibles
    const { data, error } = await admin
      .from('aeroport_passagers')
      .update({
        passagers_disponibles: admin.rpc('greatest', { a: 0, b: admin.rpc('minus', { a: 'passagers_disponibles', b: passagers_consommes }) }),
        updated_at: new Date().toISOString(),
      })
      .eq('code_oaci', code_oaci)
      .select()
      .single();

    // Alternative plus simple : utiliser du SQL brut
    const { error: updateError } = await admin.rpc('consommer_passagers_aeroport', {
      p_code_oaci: code_oaci,
      p_passagers: passagers_consommes
    });

    if (updateError) {
      // Si la fonction n'existe pas, faire l'update manuellement
      const { data: current } = await admin
        .from('aeroport_passagers')
        .select('passagers_disponibles')
        .eq('code_oaci', code_oaci)
        .single();

      if (current) {
        const newValue = Math.max(0, current.passagers_disponibles - passagers_consommes);
        await admin
          .from('aeroport_passagers')
          .update({ passagers_disponibles: newValue, updated_at: new Date().toISOString() })
          .eq('code_oaci', code_oaci);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Aeroport passagers POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
