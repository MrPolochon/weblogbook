import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { compagnie_id, pdg_id } = body;

    if (!compagnie_id || !pdg_id) return NextResponse.json({ error: 'compagnie_id et pdg_id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { data: compagnie } = await admin.from('compagnies').select('id').eq('id', compagnie_id).single();
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: pdg } = await admin.from('profiles').select('id').eq('id', pdg_id).single();
    if (!pdg) return NextResponse.json({ error: 'PDG introuvable' }, { status: 404 });

    const { error } = await admin.from('compagnies').update({ pdg_id }).eq('id', compagnie_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // S'assurer que le compte Felitz existe pour cette compagnie
    const { data: compte } = await admin.from('felitz_comptes').select('id').eq('compagnie_id', compagnie_id).single();
    if (!compte) {
      const vban = await admin.rpc('generate_vban_entreprise');
      const { error: errInsert } = await admin.from('felitz_comptes').insert({
        compagnie_id,
        type_compte: 'compagnie',
        vban: vban.data || vban,
        solde: 0,
      });
      if (errInsert) {
        console.error('Erreur création compte compagnie:', errInsert);
        // Ne pas échouer si le compte existe déjà (race condition)
        if (errInsert.code !== '23505') {
          return NextResponse.json({ error: 'Erreur lors de la création du compte Felitz' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnies PDG PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
