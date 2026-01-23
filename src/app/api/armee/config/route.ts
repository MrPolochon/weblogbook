import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Récupérer la configuration de l'armée
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    // Récupérer le compte militaire
    const { data: compteMilitaire } = await admin.from('felitz_comptes')
      .select('*, profiles:proprietaire_id(id, identifiant)')
      .eq('type', 'militaire')
      .single();

    return NextResponse.json(compteMilitaire);
  } catch (e) {
    console.error('Armee config GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer le compte de l'armée
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { action, pdg_id, solde_initial } = body;

    const admin = createAdminClient();

    if (action === 'create_compte') {
      // Vérifier si un compte militaire existe déjà
      const { data: existing } = await admin.from('felitz_comptes')
        .select('id')
        .eq('type', 'militaire')
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Un compte militaire existe déjà' }, { status: 400 });
      }

      // Générer VBAN unique pour l'armée
      let vban: string;
      let isUnique = false;
      
      do {
        vban = 'ARMYMIXOU' + Array.from({ length: 23 }, () => 
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
        ).join('');
        const { data: existingVban } = await admin.from('felitz_comptes').select('id').eq('vban', vban).single();
        isUnique = !existingVban;
      } while (!isUnique);

      // Créer le compte
      const { data, error } = await admin.from('felitz_comptes').insert({
        type: 'militaire',
        proprietaire_id: pdg_id || null,
        compagnie_id: null,
        vban,
        solde: solde_initial || 0
      }).select().single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (e) {
    console.error('Armee config POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Mettre à jour la configuration de l'armée
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { action, pdg_id } = body;

    const admin = createAdminClient();

    if (action === 'update_pdg') {
      // Récupérer le compte militaire
      const { data: compteMilitaire } = await admin.from('felitz_comptes')
        .select('id')
        .eq('type', 'militaire')
        .single();

      if (!compteMilitaire) {
        return NextResponse.json({ error: 'Aucun compte militaire trouvé' }, { status: 404 });
      }

      // Mettre à jour le PDG (proprietaire_id)
      const { data, error } = await admin.from('felitz_comptes')
        .update({ proprietaire_id: pdg_id || null })
        .eq('id', compteMilitaire.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (e) {
    console.error('Armee config PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
