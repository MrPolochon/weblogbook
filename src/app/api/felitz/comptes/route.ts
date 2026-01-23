import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const compagnieId = searchParams.get('compagnie_id');

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    let targetUserId = user.id;
    let targetCompagnieId = compagnieId || null;

    if (userId && isAdmin) {
      targetUserId = userId;
    } else if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    if (compagnieId) {
      if (!isAdmin) {
        const { data: compagnie } = await supabase.from('compagnies').select('pdg_id').eq('id', compagnieId).single();
        if (compagnie?.pdg_id !== user.id) {
          return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }
      }
    }

    // Utiliser admin client pour les admins, supabase pour les autres
    const client = isAdmin ? createAdminClient() : supabase;
    let query = client.from('felitz_comptes').select('id, user_id, compagnie_id, vban, solde, created_at, compagnies(nom), profiles(identifiant)');
    
    // Si admin, peut voir tous les comptes ou filtrer
    if (isAdmin) {
      if (targetUserId) query = query.eq('user_id', targetUserId);
      if (targetCompagnieId) query = query.eq('compagnie_id', targetCompagnieId);
      // Si aucun filtre, retourner tous les comptes pour les admins
    } else {
      // Pour les non-admins, appliquer les restrictions
      if (targetUserId) query = query.eq('user_id', targetUserId);
      if (targetCompagnieId) query = query.eq('compagnie_id', targetCompagnieId);
      else query = query.is('compagnie_id', null);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Felitz comptes GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { user_id, compagnie_id } = body;

    const admin = createAdminClient();
    if (user_id) {
      const { data: existing } = await admin.from('felitz_comptes').select('id').eq('user_id', user_id).is('compagnie_id', null).single();
      if (existing) return NextResponse.json({ error: 'Compte personnel déjà existant' }, { status: 400 });
    }

    if (compagnie_id) {
      const { data: existing } = await admin.from('felitz_comptes').select('id').eq('compagnie_id', compagnie_id).single();
      if (existing) return NextResponse.json({ error: 'Compte entreprise déjà existant' }, { status: 400 });
    }

    const vban = compagnie_id
      ? await admin.rpc('generate_vban_entreprise')
      : await admin.rpc('generate_vban_personnel');

    const typeCompte = compagnie_id ? 'compagnie' : 'personnel';
    const { data, error } = await admin.from('felitz_comptes').insert({
      user_id: user_id || null,
      compagnie_id: compagnie_id || null,
      type_compte: typeCompte,
      vban: vban.data || vban,
      solde: 0,
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Felitz comptes POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
