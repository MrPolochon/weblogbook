import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

// GET - Rechercher des pilotes par identifiant
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const admin = createAdminClient();

    const { data, error } = await admin.from('profiles')
      .select('id, identifiant')
      .ilike('identifiant', `%${query}%`)
      .neq('id', user.id) // Exclure l'utilisateur actuel
      .limit(10);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('Pilotes search:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
