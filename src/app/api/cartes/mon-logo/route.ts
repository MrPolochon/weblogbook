import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveCarteLogo, type LogoSource } from '@/lib/cartes/logo-resolver';

export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  logo_source: z.enum(['auto', 'compagnie', 'aucun']),
  logo_compagnie_id: z.string().uuid().nullable().optional(),
});

/**
 * PATCH /api/cartes/mon-logo
 *
 * Body : { logo_source: 'auto' | 'compagnie' | 'aucun', logo_compagnie_id?: uuid|null }
 *
 * Note : 'manuel' n'est PAS autorise via cette route (reserve aux admins/IFSA
 * via /api/cartes/upload). L'utilisateur peut seulement choisir entre auto,
 * compagnie specifique, ou aucun logo.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Donnees invalides', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const source = parsed.data.logo_source as LogoSource;
  const compagnieId = parsed.data.logo_compagnie_id ?? null;

  if (source === 'compagnie' && !compagnieId) {
    return NextResponse.json({ error: 'logo_compagnie_id requis avec logo_source=compagnie' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Charger la carte existante
  const { data: existing } = await admin
    .from('cartes_identite')
    .select('id, logo_url, logo_source')
    .eq('user_id', user.id)
    .maybeSingle();

  // Resoudre le nouveau logo
  const resolved = await resolveCarteLogo(
    admin,
    user.id,
    source,
    compagnieId,
    existing?.logo_url ?? null
  );

  if (source === 'compagnie' && resolved.logo_source !== 'compagnie') {
    return NextResponse.json(
      { error: 'Vous n\'etes pas rattache a cette compagnie' },
      { status: 400 }
    );
  }

  if (existing) {
    const { error } = await admin
      .from('cartes_identite')
      .update({
        logo_url: resolved.logo_url,
        logo_source: resolved.logo_source,
        logo_compagnie_id: resolved.logo_compagnie_id,
        updated_by: user.id,
      })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // L'utilisateur n'a pas encore de carte : on en cree une minimale
    const { error } = await admin
      .from('cartes_identite')
      .insert({
        user_id: user.id,
        logo_url: resolved.logo_url,
        logo_source: resolved.logo_source,
        logo_compagnie_id: resolved.logo_compagnie_id,
        couleur_fond: '#1E3A8A',
        titre: "Carte d'identification de membre d'equipage",
        sous_titre: "delivre par l'instance de l'IFSA",
        organisation: resolved.compagnie_nom ?? 'IFSA',
        cases_haut: [],
        cases_bas: [],
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    logo_source: resolved.logo_source,
    logo_compagnie_id: resolved.logo_compagnie_id,
    logo_url: resolved.logo_url,
  });
}
