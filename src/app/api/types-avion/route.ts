import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET - Liste tous les types d'avion
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin.from('types_avion')
      .select('id, nom, constructeur, code_oaci, categorie, est_militaire, est_cargo, capacite_pax, capacite_cargo_kg, prix')
      .order('nom');

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Types avion GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
