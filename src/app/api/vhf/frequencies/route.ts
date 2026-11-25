import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createBrowserClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isValidVhfFrequency } from '@/lib/vhf-frequencies';
import { isOfficialAssignment, publishedRadioAssignments } from '@/lib/official-vhf';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Helper: authenticate via cookies or Bearer token */
async function getAuthUser(request: Request): Promise<{ id: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.substring(7);
    const sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await sb.auth.getUser(accessToken);
    return user;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * GET — Liste toutes les fréquences VHF assignées
 * Accessible par tous les utilisateurs authentifiés
 * ?aeroport=XXXX  → filtre optionnel par aéroport
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser(request);
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });

    const assignments = publishedRadioAssignments(data || []);
    return NextResponse.json(aeroport ? assignments.filter(row => row.aeroport === aeroport.toUpperCase()) : assignments,
      { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
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
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const body = await request.json();
    const { aeroport, position, frequency } = body;

    if (typeof aeroport !== 'string' || !aeroport.trim() || typeof position !== 'string' || !position.trim() || typeof frequency !== 'string' || !frequency) {
      return NextResponse.json({ error: 'aeroport, position et frequency requis' }, { status: 400 });
    }

    if (isOfficialAssignment(aeroport, position)) {
      return NextResponse.json({ error: 'Ce poste suit la fiche officielle. Le réglage manuel reste disponible dans la COM box.' }, { status: 409 });
    }
    if (publishedRadioAssignments([]).some(row => row.frequency === frequency)) {
      return NextResponse.json({ error: 'Cette fréquence est déjà réservée par la fiche officielle.' }, { status: 409 });
    }

    // Valider la fréquence
    if (!isValidVhfFrequency(frequency)) {
      return NextResponse.json({ error: `Fréquence invalide : ${frequency}. Format attendu : XXX.YYY (118.000 à 136.990)` }, { status: 400 });
    }

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
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const body = await request.json();
    const { id, frequency } = body;

    if (typeof id !== 'string' || !id || typeof frequency !== 'string' || !frequency) {
      return NextResponse.json({ error: 'id et frequency requis' }, { status: 400 });
    }

    if (String(id).startsWith('official:')) {
      return NextResponse.json({ error: 'Cette attribution appartient à la fiche officielle.' }, { status: 409 });
    }
    const { data: assignment } = await adminClient.from('vhf_position_frequencies').select('aeroport, position').eq('id', id).maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Attribution introuvable' }, { status: 404 });
    if (isOfficialAssignment(assignment.aeroport, assignment.position) || publishedRadioAssignments([]).some(row => row.frequency === frequency)) {
      return NextResponse.json({ error: 'Ce poste ou cette fréquence est réservé par la fiche officielle.' }, { status: 409 });
    }

    if (!isValidVhfFrequency(frequency)) {
      return NextResponse.json({ error: `Fréquence invalide : ${frequency}` }, { status: 400 });
    }

    const { data, error } = await adminClient
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
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const adminDel = createAdminClient();
    const { data: profile } = await adminDel.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    if (id.startsWith('official:')) {
      return NextResponse.json({ error: 'Cette attribution appartient à la fiche officielle.' }, { status: 409 });
    }
    const { data: assignment } = await adminDel.from('vhf_position_frequencies').select('aeroport, position').eq('id', id).maybeSingle();
    if (!assignment) return NextResponse.json({ error: 'Attribution introuvable' }, { status: 404 });
    if (isOfficialAssignment(assignment.aeroport, assignment.position)) {
      return NextResponse.json({ error: 'Cette attribution appartient à la fiche officielle.' }, { status: 409 });
    }

    const { error } = await adminDel
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
