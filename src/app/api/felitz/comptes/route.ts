import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const typeCompte = searchParams.get('type'); // 'personnel' ou 'entreprise'

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    let query = supabase.from('felitz_comptes').select('id, type_compte, vban, solde, compagnie_id, compagnies(nom)');

    if (typeCompte === 'personnel') {
      query = query.eq('user_id', user.id).eq('type_compte', 'personnel');
    } else if (typeCompte === 'entreprise') {
      const { data: compagnie } = await supabase.from('compagnies').select('id').eq('pdg_user_id', user.id).single();
      if (!compagnie && !isAdmin) {
        return NextResponse.json({ error: 'Vous n\'êtes pas PDG d\'une compagnie' }, { status: 403 });
      }
      if (compagnie) {
        query = query.eq('compagnie_id', compagnie.id).eq('type_compte', 'entreprise');
      } else if (isAdmin) {
        query = query.eq('type_compte', 'entreprise');
      }
    } else {
      query = query.or(`user_id.eq.${user.id},compagnie_id.in.(SELECT id FROM compagnies WHERE pdg_user_id.eq.${user.id})`);
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
    const isAdmin = profile?.role === 'admin';

    const body = await request.json();
    const { type_compte, compagnie_id } = body;

    if (!type_compte || !['personnel', 'entreprise'].includes(type_compte)) {
      return NextResponse.json({ error: 'type_compte invalide' }, { status: 400 });
    }

    const admin = createAdminClient();

    if (type_compte === 'personnel') {
      const { data: existing } = await admin.from('felitz_comptes').select('id').eq('user_id', user.id).eq('type_compte', 'personnel').single();
      if (existing) {
        return NextResponse.json({ error: 'Compte personnel déjà existant' }, { status: 400 });
      }
      const { data: vbanData, error: vbanErr } = await admin.rpc('generate_vban', { type_compte: 'personnel' });
      if (vbanErr || !vbanData) return NextResponse.json({ error: 'Erreur génération VBAN' }, { status: 500 });
      const vban = vbanData as string;
      const { data, error } = await admin.from('felitz_comptes').insert({
        user_id: user.id,
        type_compte: 'personnel',
        vban: vban,
      }).select('id, vban').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, data });
    } else {
      if (!isAdmin) {
        const { data: compagnie } = await admin.from('compagnies').select('id').eq('pdg_user_id', user.id).single();
        if (!compagnie) {
          return NextResponse.json({ error: 'Vous n\'êtes pas PDG d\'une compagnie' }, { status: 403 });
        }
        const targetCompagnieId = compagnie.id;
        const { data: existing } = await admin.from('felitz_comptes').select('id').eq('compagnie_id', targetCompagnieId).eq('type_compte', 'entreprise').single();
        if (existing) {
          return NextResponse.json({ error: 'Compte entreprise déjà existant pour cette compagnie' }, { status: 400 });
        }
        const { data: vbanData, error: vbanErr } = await admin.rpc('generate_vban', { type_compte: 'entreprise' });
        if (vbanErr || !vbanData) return NextResponse.json({ error: 'Erreur génération VBAN' }, { status: 500 });
        const vban = vbanData as string;
        const { data, error } = await admin.from('felitz_comptes').insert({
          compagnie_id: targetCompagnieId,
          type_compte: 'entreprise',
          vban: vban,
        }).select('id, vban').single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, data });
      } else {
        if (!compagnie_id) return NextResponse.json({ error: 'compagnie_id requis pour admin' }, { status: 400 });
        const { data: vbanData, error: vbanErr } = await admin.rpc('generate_vban', { type_compte: 'entreprise' });
        if (vbanErr || !vbanData) return NextResponse.json({ error: 'Erreur génération VBAN' }, { status: 500 });
        const vban = vbanData as string;
        const { data, error } = await admin.from('felitz_comptes').insert({
          compagnie_id,
          type_compte: 'entreprise',
          vban: vban,
        }).select('id, vban').single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, data });
      }
    }
  } catch (e) {
    console.error('Felitz comptes POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
