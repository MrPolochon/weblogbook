export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessIfsaSpace } from '@/lib/ifsa-access';
import { isLeaderOfCompany } from '@/lib/co-pdg-utils';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role, ifsa').eq('id', user.id).single();
    const params = new URL(request.url).searchParams;
    const companyId = params.get('compagnie_id');
    if (companyId && !uuid.test(companyId)) return NextResponse.json({ error: 'Compagnie invalide' }, { status: 400 });
    const reviewer = await canAccessIfsaSpace(profile);
    if (!reviewer && (!companyId || !(await isLeaderOfCompany(user.id, companyId, admin)))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }
    let query = admin.from('compagnie_identite_demandes').select(`*,
      compagnie:compagnie_id(id, nom), demandeur:demandeur_id(identifiant), traite_par:traite_par_id(identifiant)`)
      .order('created_at', { ascending: false });
    if (companyId) query = query.eq('compagnie_id', companyId);
    const status = params.get('statut');
    if (status) {
      if (!['en_attente','approuvee','refusee'].includes(status)) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 });
      query = query.eq('statut', status);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Identité compagnie GET:', error);
    return NextResponse.json({ error: 'Impossible de charger les demandes d’identité radio' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role, ifsa').eq('id', user.id).single();
    if (!(await canAccessIfsaSpace(profile))) return NextResponse.json({ error: 'Réservé à l’IFSA' }, { status: 403 });
    const { id, action, motif_reponse } = await request.json();
    if (typeof id !== 'string' || !uuid.test(id) || !['approuver','refuser'].includes(action)
      || typeof motif_reponse !== 'string' || !motif_reponse.trim() || motif_reponse.length > 2000) {
      return NextResponse.json({ error: 'Demande, action et motif de décision valides requis' }, { status: 400 });
    }
    const { data, error } = await admin.rpc('decider_identite_compagnie', {
      p_demande_id: id, p_acteur_id: user.id, p_action: action, p_motif: motif_reponse,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '42501' ? 403 : 409 });
    return NextResponse.json({ demande: data, message: action === 'approuver'
      ? 'Identité radio approuvée et appliquée à la compagnie.' : 'Demande refusée. Les appellations actuelles sont conservées.' });
  } catch (error) {
    console.error('Identité compagnie PATCH:', error);
    return NextResponse.json({ error: 'Impossible de traiter la demande' }, { status: 500 });
  }
}
