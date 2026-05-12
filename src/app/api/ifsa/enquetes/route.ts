import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const STATUTS_VALIDES = ['ouverte', 'en_cours', 'cloturee', 'classee'] as const;
type StatutEnquete = typeof STATUTS_VALIDES[number];

const PRIORITES_VALIDES = ['basse', 'normale', 'haute', 'urgente'] as const;
type PrioriteEnquete = typeof PRIORITES_VALIDES[number];

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
    const priorite = searchParams.get('priorite');
    const search = searchParams.get('q')?.trim();
    const limitRaw = searchParams.get('limit');
    const limit = Math.max(1, Math.min(parseInt(limitRaw || '100', 10) || 100, 500));

    let query = admin.from('ifsa_enquetes')
      .select(`
        *,
        pilote_concerne:profiles!pilote_concerne_id(id, identifiant),
        compagnie_concernee:compagnies!compagnie_concernee_id(id, nom),
        enqueteur:profiles!enqueteur_id(id, identifiant),
        ouvert_par:profiles!ouvert_par_id(id, identifiant)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statut === 'actives') {
      query = query.in('statut', ['ouverte', 'en_cours']);
    } else if (statut && statut !== 'tous' && statut !== 'all' && (STATUTS_VALIDES as readonly string[]).includes(statut)) {
      query = query.eq('statut', statut);
    }

    if (priorite && (PRIORITES_VALIDES as readonly string[]).includes(priorite)) {
      query = query.eq('priorite', priorite);
    }

    if (search) {
      const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `titre.ilike.%${escaped}%,description.ilike.%${escaped}%,conclusion.ilike.%${escaped}%,numero_dossier.ilike.%${escaped}%`,
      );
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
    const { titre, description, priorite, pilote_concerne_id, compagnie_concernee_id, signalement_id } = body as {
      titre?: string;
      description?: string | null;
      priorite?: PrioriteEnquete;
      pilote_concerne_id?: string | null;
      compagnie_concernee_id?: string | null;
      signalement_id?: string | null;
    };

    if (!titre) {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    }

    const titreClean = String(titre).trim();
    if (titreClean.length < 4) {
      return NextResponse.json({ error: 'Le titre doit contenir au moins 4 caractères' }, { status: 400 });
    }

    const prioriteFinale: PrioriteEnquete = (priorite && (PRIORITES_VALIDES as readonly string[]).includes(priorite))
      ? priorite
      : 'normale';

    const admin = createAdminClient();

    const { data, error } = await admin.rpc('ifsa_enquetes_create', {
      p_titre: titreClean,
      p_description: description ? String(description).trim() : null,
      p_priorite: prioriteFinale,
      p_pilote_concerne_id: pilote_concerne_id || null,
      p_compagnie_concernee_id: compagnie_concernee_id || null,
      p_ouvert_par_id: user.id,
      p_enqueteur_id: user.id,
    });

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
      message: `Enquête ${data.numero_dossier} ouverte`,
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
    const { id, statut, priorite, enqueteur_id, conclusion, titre, description } = body as {
      id?: string;
      statut?: StatutEnquete;
      priorite?: PrioriteEnquete;
      enqueteur_id?: string | null;
      conclusion?: string | null;
      titre?: string | null;
      description?: string | null;
    };

    if (!id) {
      return NextResponse.json({ error: 'ID enquête requis' }, { status: 400 });
    }

    if (statut && !(STATUTS_VALIDES as readonly string[]).includes(statut)) {
      return NextResponse.json({ error: `Statut invalide. Valeurs autorisées: ${STATUTS_VALIDES.join(', ')}` }, { status: 400 });
    }

    if (priorite && !(PRIORITES_VALIDES as readonly string[]).includes(priorite)) {
      return NextResponse.json({ error: `Priorité invalide. Valeurs autorisées: ${PRIORITES_VALIDES.join(', ')}` }, { status: 400 });
    }

    if (titre !== undefined && titre !== null) {
      const t = String(titre).trim();
      if (t.length < 4) {
        return NextResponse.json({ error: 'Le titre doit contenir au moins 4 caractères' }, { status: 400 });
      }
    }

    const admin = createAdminClient();

    const updateData: Record<string, unknown> = {};
    if (statut) {
      updateData.statut = statut;
      if (statut === 'cloturee' || statut === 'classee') {
        updateData.cloture_at = new Date().toISOString();
      } else {
        updateData.cloture_at = null;
      }
    }
    if (priorite) updateData.priorite = priorite;
    if (enqueteur_id !== undefined) updateData.enqueteur_id = enqueteur_id;
    if (conclusion !== undefined) updateData.conclusion = conclusion ? String(conclusion).trim() : null;
    if (titre !== undefined) updateData.titre = titre ? String(titre).trim() : null;
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 });
    }

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
