import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET - Récupérer compte(s) Felitz
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'personnel' | 'entreprise' | null
    const userId = searchParams.get('user_id');
    const compagnieId = searchParams.get('compagnie_id');

    const admin = createAdminClient();
    let query = admin.from('felitz_comptes').select('*, compagnies(nom)');

    if (type) query = query.eq('type', type);

    if (isAdmin) {
      // Un admin doit explicitement filtrer par user_id ou compagnie_id pour éviter
      // de récupérer la totalité des comptes Felitz du système (fuite de données).
      if (userId) {
        query = query.eq('proprietaire_id', userId);
      } else if (compagnieId) {
        query = query.eq('compagnie_id', compagnieId);
      } else {
        return NextResponse.json(
          { error: 'Précisez user_id ou compagnie_id pour lister les comptes.' },
          { status: 400 }
        );
      }
    } else if (!isAdmin) {
      // Non-admin : personnel + comptes des compagnies dont l’utilisateur est PDG ou co-PDG
      const { data: pdgCompagnies } = await supabase.from('compagnies').select('id').eq('pdg_id', user.id);
      const { data: coPdgRows } = await supabase
        .from('compagnie_employes')
        .select('compagnie_id')
        .eq('pilote_id', user.id)
        .eq('role', 'co_pdg');
      const compagnieIds = [
        ...(pdgCompagnies || []).map((c) => c.id),
        ...(coPdgRows || []).map((r) => r.compagnie_id),
      ];
      const uniqueCompIds = Array.from(new Set(compagnieIds));

      if (uniqueCompIds.length > 0) {
        query = query.or(`proprietaire_id.eq.${user.id},compagnie_id.in.(${uniqueCompIds.join(',')})`);
      } else {
        query = query.eq('proprietaire_id', user.id);
      }
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Felitz compte GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer un compte (admin uniquement pour entreprises existantes)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { type, proprietaire_id, compagnie_id, solde_initial } = body;

    // Refus d'un solde initial négatif (un nombre négatif est truthy en JS,
    // donc l'ancien `solde_initial || 0` laissait passer -1000).
    const soldeNum = Number(solde_initial);
    if (solde_initial !== undefined && solde_initial !== null && (!Number.isFinite(soldeNum) || soldeNum < 0)) {
      return NextResponse.json({ error: 'Le solde initial doit être un nombre positif ou nul.' }, { status: 400 });
    }
    const soldeFinal = Number.isFinite(soldeNum) && soldeNum >= 0 ? Math.floor(soldeNum) : 0;

    const admin = createAdminClient();

    // Générer VBAN unique
    const prefix = type === 'entreprise' ? 'ENTERMIXOU' : 'MIXOU';
    let vban: string;
    let isUnique = false;
    
    do {
      vban = prefix + Array.from({ length: 22 }, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]
      ).join('');
      const { data: existing } = await admin.from('felitz_comptes').select('id').eq('vban', vban).single();
      isUnique = !existing;
    } while (!isUnique);

    const { data, error } = await admin.from('felitz_comptes').insert({
      type,
      proprietaire_id: type === 'personnel' ? proprietaire_id : null,
      compagnie_id: type === 'entreprise' ? compagnie_id : null,
      vban,
      solde: soldeFinal,
    }).select().single();

    if (error) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Felitz compte POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
