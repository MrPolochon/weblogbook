import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

// Vérifier si l'utilisateur est IFSA
async function checkIfsa(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from('profiles')
    .select('role, ifsa')
    .eq('id', userId)
    .single();
  return profile?.ifsa || profile?.role === 'admin';
}

// GET - Récupérer les enquêtes (IFSA uniquement)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const statut = searchParams.get('statut');

    let query = admin.from('ifsa_enquetes')
      .select(`
        *,
        pilote_concerne:profiles!pilote_concerne_id(id, identifiant),
        compagnie_concernee:compagnies!compagnie_concernee_id(id, nom),
        enqueteur:profiles!enqueteur_id(id, identifiant),
        ouvert_par:profiles!ouvert_par_id(id, identifiant)
      `)
      .order('created_at', { ascending: false });

    if (statut && statut !== 'tous') {
      query = query.eq('statut', statut);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Enquêtes GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer une enquête
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { titre, description, priorite, pilote_concerne_id, compagnie_concernee_id, signalement_id } = body;

    if (!titre) {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Générer le numéro de dossier
    const year = new Date().getFullYear();
    const { count } = await admin.from('ifsa_enquetes')
      .select('*', { count: 'exact', head: true })
      .like('numero_dossier', `ENQ-${year}-%`);

    const numeroDossier = `ENQ-${year}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await admin.from('ifsa_enquetes')
      .insert({
        numero_dossier: numeroDossier,
        titre,
        description: description || null,
        priorite: priorite || 'normale',
        pilote_concerne_id: pilote_concerne_id || null,
        compagnie_concernee_id: compagnie_concernee_id || null,
        ouvert_par_id: user.id,
        enqueteur_id: user.id, // Par défaut, celui qui ouvre l'enquête
        statut: 'ouverte'
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Si lié à un signalement, mettre à jour le signalement
    if (signalement_id) {
      await admin.from('ifsa_signalements')
        .update({ 
          statut: 'enquete_ouverte',
          enquete_id: data.id,
          traite_par_id: user.id,
          traite_at: new Date().toISOString()
        })
        .eq('id', signalement_id);
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Enquête ${numeroDossier} ouverte`,
      enquete: data 
    });
  } catch (e) {
    console.error('Enquêtes POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Mettre à jour une enquête
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { id, statut, priorite, enqueteur_id, conclusion } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID enquête requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const updateData: Record<string, unknown> = {};
    if (statut) {
      updateData.statut = statut;
      if (statut === 'cloturee' || statut === 'classee') {
        updateData.cloture_at = new Date().toISOString();
      }
    }
    if (priorite) updateData.priorite = priorite;
    if (enqueteur_id) updateData.enqueteur_id = enqueteur_id;
    if (conclusion !== undefined) updateData.conclusion = conclusion;

    const { data, error } = await admin.from('ifsa_enquetes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, enquete: data });
  } catch (e) {
    console.error('Enquêtes PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
