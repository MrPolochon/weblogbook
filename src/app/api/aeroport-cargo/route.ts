import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAeroportInfo } from '@/lib/aeroports-ptfs';

export const dynamic = 'force-dynamic';

// GET - Récupérer le cargo disponible + last_flight_arrival pour un aéroport
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const codeOaci = searchParams.get('code_oaci');

    const admin = createAdminClient();

    try {
      await admin.rpc('regenerer_cargo_aeroport');
    } catch {
      // Si la RPC n'existe pas, on continue
    }

    const baseSelect = 'code_oaci, cargo_disponible, cargo_max, derniere_regeneration_cargo, last_flight_arrival';

    if (codeOaci) {
      const { data, error } = await admin
        .from('aeroports')
        .select(baseSelect)
        .eq('code_oaci', codeOaci)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          const aeroportInfo = getAeroportInfo(codeOaci);
          const cargoMax = aeroportInfo?.cargoMax ?? 0;
          return NextResponse.json({
            code_oaci: codeOaci,
            cargo_disponible: cargoMax,
            cargo_max: cargoMax,
            derniere_regeneration: null,
            last_flight_arrival: null,
          });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        code_oaci: data.code_oaci,
        cargo_disponible: data.cargo_disponible,
        cargo_max: data.cargo_max,
        derniere_regeneration: data.derniere_regeneration_cargo,
        last_flight_arrival: data.last_flight_arrival,
      });
    }

    const { data, error } = await admin
      .from('aeroports')
      .select(baseSelect)
      .order('code_oaci');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const remapped = (data ?? []).map((row) => ({
      code_oaci: row.code_oaci,
      cargo_disponible: row.cargo_disponible,
      cargo_max: row.cargo_max,
      derniere_regeneration: row.derniere_regeneration_cargo,
      last_flight_arrival: row.last_flight_arrival,
    }));

    return NextResponse.json(remapped);
  } catch (e) {
    console.error('Aeroport cargo GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
