import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAeroportInfo } from '@/lib/aeroports-ptfs';

export const dynamic = 'force-dynamic';

// GET - Récupérer le cargo disponible pour un aéroport
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const codeOaci = searchParams.get('code_oaci');

    const admin = createAdminClient();

    // D'abord régénérer le cargo si nécessaire
    try {
      await admin.rpc('regenerer_cargo_aeroport');
    } catch (e) {
      // Si la fonction n'existe pas, continuer
    }

    if (codeOaci) {
      const { data, error } = await admin
        .from('aeroport_cargo')
        .select('*')
        .eq('code_oaci', codeOaci)
        .single();

      if (error) {
        // Si pas trouvé, retourner une valeur par défaut depuis les données statiques
        if (error.code === 'PGRST116') {
          const aeroportInfo = getAeroportInfo(codeOaci);
          const cargoMax = aeroportInfo?.cargoMax ?? 0;
          return NextResponse.json({ 
            code_oaci: codeOaci, 
            cargo_disponible: cargoMax, 
            cargo_max: cargoMax 
          });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json(data);
    }

    // Retourner tous les aéroports
    const { data, error } = await admin
      .from('aeroport_cargo')
      .select('*')
      .order('code_oaci');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Aeroport cargo GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
