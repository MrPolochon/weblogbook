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

// GET - Récupérer les sanctions
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'mes' pour mes sanctions, 'toutes' pour IFSA
    const actifOnly = searchParams.get('actif') === 'true';

    const isIfsa = await checkIfsa(supabase, user.id);

    if (type === 'toutes' && !isIfsa) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    let query = admin.from('ifsa_sanctions')
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant),
        cible_compagnie:compagnies!cible_compagnie_id(id, nom),
        emis_par:profiles!emis_par_id(id, identifiant),
        cleared_by:profiles!cleared_by_id(id, identifiant)
      `)
      .order('created_at', { ascending: false });

    if (type !== 'toutes') {
      // Sanctions concernant l'utilisateur
      query = query.eq('cible_pilote_id', user.id);
    }

    if (actifOnly) {
      query = query.eq('actif', true);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Sanctions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Créer une sanction
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { 
      type_sanction, 
      cible_type,
      cible_pilote_id, 
      cible_compagnie_id, 
      motif, 
      details,
      duree_jours,
      montant_amende 
    } = body;

    if (!type_sanction || !cible_type || !motif) {
      return NextResponse.json({ error: 'Type, cible et motif requis' }, { status: 400 });
    }

    if (cible_type === 'pilote' && !cible_pilote_id) {
      return NextResponse.json({ error: 'Pilote cible requis' }, { status: 400 });
    }

    if (cible_type === 'compagnie' && !cible_compagnie_id) {
      return NextResponse.json({ error: 'Compagnie cible requise' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Calculer la date d'expiration si c'est une suspension temporaire
    let expireAt = null;
    if (type_sanction === 'suspension_temporaire' && duree_jours) {
      const expire = new Date();
      expire.setDate(expire.getDate() + duree_jours);
      expireAt = expire.toISOString();
    }

    const { data, error } = await admin.from('ifsa_sanctions')
      .insert({
        type_sanction,
        cible_type,
        cible_pilote_id: cible_pilote_id || null,
        cible_compagnie_id: cible_compagnie_id || null,
        motif,
        details: details || null,
        duree_jours: duree_jours || null,
        montant_amende: montant_amende || null,
        emis_par_id: user.id,
        actif: true,
        expire_at: expireAt
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Récupérer les infos pour la notification
    const { data: ifsaProfile } = await admin.from('profiles')
      .select('identifiant')
      .eq('id', user.id)
      .single();

    // Notifier la cible
    const destinataireId = cible_pilote_id || (cible_compagnie_id ? await getCompagniePdg(admin, cible_compagnie_id) : null);
    
    if (destinataireId) {
      const typesLabels: Record<string, string> = {
        'avertissement': '⚠️ Avertissement',
        'suspension_temporaire': '🚫 Suspension temporaire',
        'suspension_licence': '🔴 Suspension de licence',
        'retrait_licence': '❌ Retrait de licence',
        'amende': '💰 Amende'
      };

      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: destinataireId,
        titre: `${typesLabels[type_sanction] || 'Sanction'} - IFSA`,
        contenu: `**Sanction IFSA**\n\nType : ${typesLabels[type_sanction]}\n\nMotif : ${motif}\n\n${details ? `Détails : ${details}\n\n` : ''}${duree_jours ? `Durée : ${duree_jours} jours\n\n` : ''}${montant_amende ? `Montant : ${montant_amende} F$\n\n` : ''}Agent IFSA : ${ifsaProfile?.identifiant}\n\nPour toute contestation, veuillez contacter l'IFSA.`,
        type_message: 'sanction_ifsa'
      });
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Sanction émise',
      sanction: data 
    });
  } catch (e) {
    console.error('Sanctions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Lever une sanction (clear)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID sanction requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin.from('ifsa_sanctions')
      .update({
        actif: false,
        cleared_by_id: user.id,
        cleared_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        cible_pilote:profiles!cible_pilote_id(id, identifiant)
      `)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Notifier la cible que la sanction est levée
    const ciblePilote = data.cible_pilote ? (Array.isArray(data.cible_pilote) ? data.cible_pilote[0] : data.cible_pilote) : null;
    if (ciblePilote?.id) {
      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: ciblePilote.id,
        titre: '✅ Sanction levée - IFSA',
        contenu: `Bonne nouvelle !\n\nVotre sanction pour "${data.motif}" a été levée par l'IFSA.\n\nVous pouvez reprendre vos activités normalement.`,
        type_message: 'normal'
      });
    }

    return NextResponse.json({ ok: true, message: 'Sanction levée', sanction: data });
  } catch (e) {
    console.error('Sanctions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// Helper pour récupérer le PDG d'une compagnie
async function getCompagniePdg(admin: ReturnType<typeof createAdminClient>, compagnieId: string): Promise<string | null> {
  const { data } = await admin.from('compagnies')
    .select('pdg_id')
    .eq('id', compagnieId)
    .single();
  return data?.pdg_id || null;
}
