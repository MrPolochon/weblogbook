import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const compteId = searchParams.get('compte_id');

    if (!compteId) return NextResponse.json({ error: 'compte_id requis' }, { status: 400 });

    const { data: compte } = await supabase.from('felitz_comptes').select('user_id, compagnie_id, compagnies(pdg_id)').eq('id', compteId).single();
    if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });

    const canAccess = compte.user_id === user.id || (compte.compagnie_id && (compte as any).compagnies?.pdg_id === user.id);
    if (!canAccess) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('felitz_transactions')
      .select('id, type, montant, titre, libelle, created_at, compte_destinataire_id, felitz_comptes!felitz_transactions_compte_destinataire_id_fkey(vban)')
      .eq('compte_id', compteId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Felitz transactions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
