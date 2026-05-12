import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const STATUTS_VALIDES = ['nouveau', 'en_examen', 'enquete_ouverte', 'classe', 'rejete'] as const;
type StatutSignalement = typeof STATUTS_VALIDES[number];

async function checkIfsa(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from('profiles')
    .select('role, ifsa')
    .eq('id', userId)
    .single();
  return profile?.ifsa || profile?.role === 'admin';
}

// GET - Récupérer les signalements
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'mes' pour mes signalements, 'tous' pour IFSA
    const statut = searchParams.get('statut');
    const search = searchParams.get('q')?.trim();
    const limitRaw = searchParams.get('limit');
    const limit = Math.max(1, Math.min(parseInt(limitRaw || '100', 10) || 100, 500));

    const isIfsa = await checkIfsa(supabase, user.id);

    if (type === 'tous' && !isIfsa) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    let query = admin.from('ifsa_signalements')
      .select(`
        *,
        signale_par:profiles!signale_par_id(id, identifiant),
        pilote_signale:profiles!pilote_signale_id(id, identifiant),
        compagnie_signalee:compagnies!compagnie_signalee_id(id, nom),
        traite_par:profiles!traite_par_id(id, identifiant),
        enquete:ifsa_enquetes!enquete_id(id, numero_dossier, titre, statut)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type !== 'tous') {
      query = query.eq('signale_par_id', user.id);
    }

    if (statut && (STATUTS_VALIDES as readonly string[]).includes(statut)) {
      query = query.eq('statut', statut);
    }

    if (search) {
      // Recherche dans titre / description / numéro
      const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `titre.ilike.%${escaped}%,description.ilike.%${escaped}%,numero_signalement.ilike.%${escaped}%`,
      );
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Signalements GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer un signalement
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { type_signalement, titre, description, pilote_signale_id, compagnie_signalee_id, preuves } = body;

    if (!type_signalement || !titre || !description) {
      return NextResponse.json({ error: 'Type, titre et description requis' }, { status: 400 });
    }

    const titreClean = String(titre).trim();
    const descriptionClean = String(description).trim();
    if (titreClean.length < 4) {
      return NextResponse.json({ error: 'Le titre doit contenir au moins 4 caractères' }, { status: 400 });
    }
    if (descriptionClean.length < 10) {
      return NextResponse.json({ error: 'La description doit contenir au moins 10 caractères' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin.rpc('ifsa_signalements_create', {
      p_type_signalement: type_signalement,
      p_titre: titreClean,
      p_description: descriptionClean,
      p_signale_par_id: user.id,
      p_pilote_signale_id: pilote_signale_id || null,
      p_compagnie_signalee_id: compagnie_signalee_id || null,
      p_preuves: preuves || null,
      p_statut: 'nouveau',
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      message: `Signalement ${data.numero_signalement} créé`,
      signalement: data
    });
  } catch (e) {
    console.error('Signalements POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Mettre à jour un signalement (IFSA uniquement)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { id, statut, reponse_ifsa } = body as { id?: string; statut?: StatutSignalement; reponse_ifsa?: string | null };

    if (!id) {
      return NextResponse.json({ error: 'ID signalement requis' }, { status: 400 });
    }

    if (statut && !(STATUTS_VALIDES as readonly string[]).includes(statut)) {
      return NextResponse.json({ error: `Statut invalide. Valeurs autorisées: ${STATUTS_VALIDES.join(', ')}` }, { status: 400 });
    }

    const admin = createAdminClient();

    const updateData: Record<string, unknown> = {};
    if (statut) updateData.statut = statut;
    if (reponse_ifsa !== undefined) updateData.reponse_ifsa = reponse_ifsa;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 });
    }
    updateData.traite_par_id = user.id;
    updateData.traite_at = new Date().toISOString();

    const { data, error } = await admin.from('ifsa_signalements')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, signalement: data });
  } catch (e) {
    console.error('Signalements PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
