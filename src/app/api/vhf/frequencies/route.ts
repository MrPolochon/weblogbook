import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { isValidVhfFrequency } from '@/lib/vhf-frequencies';

export const dynamic = 'force-dynamic';

/**
 * GET — Liste toutes les fréquences VHF assignées
 * Accessible par tous les utilisateurs authentifiés
 * ?aeroport=XXXX  → filtre optionnel par aéroport
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const aeroport = searchParams.get('aeroport');

    const admin = createAdminClient();
    let query = admin
      .from('vhf_position_frequencies')
      .select('*')
      .order('aeroport')
      .order('position');

    if (aeroport) {
      query = query.eq('aeroport', aeroport.toUpperCase());
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data || []);
  } catch (e) {
    console.error('VHF frequencies GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST — Assigner une fréquence à un aéroport/position
 * Admin uniquement
 * Body: { aeroport, position, frequency }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const body = await request.json();
    const { aeroport, position, frequency } = body;

    if (!aeroport || !position || !frequency) {
      return NextResponse.json({ error: 'aeroport, position et frequency requis' }, { status: 400 });
    }

    // Valider la fréquence
    if (!isValidVhfFrequency(frequency)) {
      return NextResponse.json({ error: `Fréquence invalide : ${frequency}. Format attendu : XXX.YYY (118.000 à 132.975)` }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from('vhf_position_frequencies')
      .insert({
        aeroport: aeroport.toUpperCase(),
        position,
        frequency,
      })
      .select()
      .single();

    if (error) {
      // Contrainte d'unicité
      if (error.code === '23505') {
        if (error.message.includes('frequency')) {
          return NextResponse.json({ error: `La fréquence ${frequency} est déjà attribuée à une autre position.` }, { status: 409 });
        }
        return NextResponse.json({ error: `La position ${position} à ${aeroport} a déjà une fréquence.` }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error('VHF frequencies POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PATCH — Modifier la fréquence d'une assignation existante
 * Admin uniquement
 * Body: { id, frequency }
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const body = await request.json();
    const { id, frequency } = body;

    if (!id || !frequency) {
      return NextResponse.json({ error: 'id et frequency requis' }, { status: 400 });
    }

    if (!isValidVhfFrequency(frequency)) {
      return NextResponse.json({ error: `Fréquence invalide : ${frequency}` }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from('vhf_position_frequencies')
      .update({ frequency })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `La fréquence ${frequency} est déjà attribuée.` }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error('VHF frequencies PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE — Supprimer une assignation de fréquence
 * Admin uniquement
 * ?id=UUID
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('vhf_position_frequencies')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('VHF frequencies DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
