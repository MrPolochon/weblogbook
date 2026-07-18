export const dynamic = 'force-dynamic';

import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessCompteMilitaire, canNominatePdgMilitaire, PDG_MILITAIRE_ROLE } from '@/lib/armee';

function generateArmyVban(): string {
  return (
    'ARMYMIXOU' +
    Array.from({ length: 23 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)],
    ).join('')
  );
}

/** GET — compte Felitz armée (admin ou PDG militaire). */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: compteMilitaire } = await admin
      .from('felitz_comptes')
      .select('*, profiles:proprietaire_id(id, identifiant)')
      .eq('type', 'militaire')
      .maybeSingle();

    if (!compteMilitaire) return NextResponse.json(null);

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!(await canAccessCompteMilitaire(user.id, profile))) {
      return NextResponse.json({ error: 'Accès réservé au PDG militaire ou aux administrateurs' }, { status: 403 });
    }

    return NextResponse.json({
      ...compteMilitaire,
      role_info: {
        label: PDG_MILITAIRE_ROLE.label,
        description: PDG_MILITAIRE_ROLE.description,
        is_pdg: compteMilitaire.proprietaire_id === user.id,
      },
    });
  } catch (e) {
    console.error('Armee config GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** POST — créer le compte de l'armée (admin). */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!canNominatePdgMilitaire(profile)) {
      return NextResponse.json({ error: 'Seul un administrateur du site peut créer le compte / nommer le PDG' }, { status: 403 });
    }

    const body = await req.json();
    const { action, pdg_id, solde_initial } = body;
    const admin = createAdminClient();

    if (action !== 'create_compte') {
      return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }

    const { data: existing } = await admin.from('felitz_comptes').select('id').eq('type', 'militaire').maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Un compte militaire existe déjà' }, { status: 400 });
    }

    let vban: string;
    let isUnique = false;
    do {
      vban = generateArmyVban();
      const { data: existingVban } = await admin.from('felitz_comptes').select('id').eq('vban', vban).maybeSingle();
      isUnique = !existingVban;
    } while (!isUnique);

    const { data, error } = await admin
      .from('felitz_comptes')
      .insert({
        type: 'militaire',
        proprietaire_id: pdg_id || null,
        compagnie_id: null,
        vban,
        solde: solde_initial || 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Armee config POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** PATCH — mettre à jour le PDG militaire (admin). */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!canNominatePdgMilitaire(profile)) {
      return NextResponse.json({ error: 'Seul un administrateur du site peut nommer le PDG militaire' }, { status: 403 });
    }

    const body = await req.json();
    const { action, pdg_id } = body;
    if (action !== 'update_pdg') {
      return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: compteMilitaire } = await admin.from('felitz_comptes').select('id').eq('type', 'militaire').maybeSingle();
    if (!compteMilitaire) {
      return NextResponse.json({ error: 'Aucun compte militaire trouvé' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('felitz_comptes')
      .update({ proprietaire_id: pdg_id || null })
      .eq('id', compteMilitaire.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Armee config PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
