import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCompagniesAvecLogoForUser } from '@/lib/cartes/logo-resolver';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cartes/mes-logos-disponibles
 *
 * Retourne :
 *   - les compagnies auxquelles l'utilisateur est rattache, avec leur logo et son role
 *   - le choix actuel (logo_source + logo_compagnie_id)
 *
 * Permet a l'utilisateur de choisir le logo de carte parmi les compagnies
 * dont il est PDG, co-PDG ou employe.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const admin = createAdminClient();

  const [compagnies, carteRes] = await Promise.all([
    getCompagniesAvecLogoForUser(admin, user.id),
    admin
      .from('cartes_identite')
      .select('logo_url, logo_source, logo_compagnie_id')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const carte = carteRes.data ?? null;

  return NextResponse.json({
    compagnies,
    current: {
      logo_source: (carte?.logo_source as 'auto' | 'compagnie' | 'manuel' | 'aucun') ?? 'auto',
      logo_compagnie_id: carte?.logo_compagnie_id ?? null,
      logo_url: carte?.logo_url ?? null,
    },
  });
}
