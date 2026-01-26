import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

// GET - Récupérer les signalements
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'mes' pour mes signalements, 'tous' pour IFSA

    // Vérifier si l'utilisateur est IFSA
    const { data: profile } = await supabase.from('profiles')
      .select('role, ifsa')
      .eq('id', user.id)
      .single();

    const isIfsa = profile?.ifsa || profile?.role === 'admin';

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
      .order('created_at', { ascending: false });

    if (type !== 'tous') {
      query = query.eq('signale_par_id', user.id);
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

    const admin = createAdminClient();

    // Générer le numéro de signalement
    const year = new Date().getFullYear();
    const { count } = await admin.from('ifsa_signalements')
      .select('*', { count: 'exact', head: true })
      .like('numero_signalement', `SIG-${year}-%`);

    const numeroSignalement = `SIG-${year}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await admin.from('ifsa_signalements')
      .insert({
        numero_signalement: numeroSignalement,
        type_signalement,
        titre,
        description,
        signale_par_id: user.id,
        pilote_signale_id: pilote_signale_id || null,
        compagnie_signalee_id: compagnie_signalee_id || null,
        preuves: preuves || null,
        statut: 'nouveau'
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ 
      ok: true, 
      message: `Signalement ${numeroSignalement} créé`,
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

    // Vérifier si l'utilisateur est IFSA
    const { data: profile } = await supabase.from('profiles')
      .select('role, ifsa')
      .eq('id', user.id)
      .single();

    if (!profile?.ifsa && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { id, statut, reponse_ifsa } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID signalement requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const updateData: Record<string, unknown> = {};
    if (statut) updateData.statut = statut;
    if (reponse_ifsa !== undefined) updateData.reponse_ifsa = reponse_ifsa;
    if (Object.keys(updateData).length > 0) {
      updateData.traite_par_id = user.id;
      updateData.traite_at = new Date().toISOString();
    }

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
