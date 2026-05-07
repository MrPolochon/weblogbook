import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET - Récupérer les passagers disponibles + last_flight_arrival pour un aéroport
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const codeOaci = searchParams.get('code_oaci');

    const admin = createAdminClient();

    // D'abord régénérer les passagers si nécessaire
    try {
      await admin.rpc('regenerer_passagers_aeroport');
    } catch {
      // Si la RPC n'existe pas, on continue
    }

    // On lit la table unifiée `aeroports` pour récupérer aussi last_flight_arrival
    const baseSelect = 'code_oaci, passagers_disponibles, passagers_max, derniere_regeneration_pax, last_flight_arrival, updated_at';

    if (codeOaci) {
      const { data, error } = await admin
        .from('aeroports')
        .select(baseSelect)
        .eq('code_oaci', codeOaci)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json({
            code_oaci: codeOaci,
            passagers_disponibles: 5000,
            passagers_max: 5000,
            derniere_regeneration: null,
            last_flight_arrival: null,
          });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        code_oaci: data.code_oaci,
        passagers_disponibles: data.passagers_disponibles,
        passagers_max: data.passagers_max,
        derniere_regeneration: data.derniere_regeneration_pax,
        last_flight_arrival: data.last_flight_arrival,
        updated_at: data.updated_at,
      });
    }

    const { data, error } = await admin
      .from('aeroports')
      .select(baseSelect)
      .order('code_oaci');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const remapped = (data ?? []).map((row) => ({
      code_oaci: row.code_oaci,
      passagers_disponibles: row.passagers_disponibles,
      passagers_max: row.passagers_max,
      derniere_regeneration: row.derniere_regeneration_pax,
      last_flight_arrival: row.last_flight_arrival,
      updated_at: row.updated_at,
    }));

    return NextResponse.json(remapped);
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

    const { error: rpcError } = await admin.rpc('consommer_passagers_aeroport', {
      p_code_oaci: code_oaci,
      p_passagers: passagers_consommes,
    });

    if (rpcError) {
      // Fallback : update manuel sur la table unifiée
      const { data: current } = await admin
        .from('aeroports')
        .select('passagers_disponibles')
        .eq('code_oaci', code_oaci)
        .single();
      if (current) {
        const newValue = Math.max(0, current.passagers_disponibles - passagers_consommes);
        await admin
          .from('aeroports')
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
