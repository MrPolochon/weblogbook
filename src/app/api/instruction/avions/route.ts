import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function canManageInstruction(role: string | null | undefined): boolean {
  return role === 'instructeur' || role === 'admin';
}

function randomImmat(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = 'F-';
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function generateUniqueImmat(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let i = 0; i < 30; i += 1) {
    const candidate = randomImmat();
    const [{ data: a }, { data: b }] = await Promise.all([
      admin.from('inventaire_avions').select('id').eq('immatriculation', candidate).maybeSingle(),
      admin.from('compagnie_avions').select('id').eq('immatriculation', candidate).maybeSingle(),
    ]);
    if (!a && !b) return candidate;
  }
  throw new Error('Impossible de générer une immatriculation unique.');
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const eleveId = String(searchParams.get('eleve_id') || '');
    if (!eleveId) return NextResponse.json({ error: 'eleve_id requis.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const { data: rows, error } = await admin
      .from('inventaire_avions')
      .select('id, type_avion_id, nom_personnalise, immatriculation, aeroport_actuel, statut, usure_percent, instruction_actif, types_avion(id, nom, code_oaci)')
      .eq('instruction_actif', true)
      .eq('instruction_eleve_id', eleveId)
      .eq('instruction_instructeur_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(rows || []);
  } catch (e) {
    console.error('instruction/avions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const body = await request.json();
    const eleveId = String(body.eleve_id || '');
    const typeAvionId = String(body.type_avion_id || '');
    const nomPersonnalise = body.nom_personnalise ? String(body.nom_personnalise).trim() : null;
    let immat = body.immatriculation ? String(body.immatriculation).trim().toUpperCase() : '';

    if (!eleveId || !typeAvionId) {
      return NextResponse.json({ error: 'eleve_id et type_avion_id requis.' }, { status: 400 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('id, formation_instruction_active, instructeur_referent_id')
      .eq('id', eleveId)
      .single();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
    if (!eleve.formation_instruction_active) {
      return NextResponse.json({ error: 'La formation de cet élève n’est pas active.' }, { status: 400 });
    }
    if (eleve.instructeur_referent_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Cet élève n’est pas rattaché à vous.' }, { status: 403 });
    }

    if (!immat) {
      immat = await generateUniqueImmat(admin);
    }

    const { data: insertRow, error } = await admin
      .from('inventaire_avions')
      .insert({
        proprietaire_id: eleveId,
        type_avion_id: typeAvionId,
        nom_personnalise: nomPersonnalise,
        immatriculation: immat,
        aeroport_actuel: 'IRFD',
        usure_percent: 100,
        statut: 'ground',
        instruction_instructeur_id: user.id,
        instruction_eleve_id: eleveId,
        instruction_actif: true,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: insertRow.id });
  } catch (e) {
    console.error('instruction/avions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 });

    const { data: row } = await admin
      .from('inventaire_avions')
      .select('id, instruction_actif, instruction_instructeur_id')
      .eq('id', id)
      .single();
    if (!row || !row.instruction_actif) {
      return NextResponse.json({ error: 'Avion temporaire introuvable.' }, { status: 404 });
    }
    if (row.instruction_instructeur_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (body.nom_personnalise !== undefined) {
      updates.nom_personnalise = body.nom_personnalise ? String(body.nom_personnalise).trim() : null;
    }
    if (body.immatriculation !== undefined) {
      updates.immatriculation = String(body.immatriculation || '').trim().toUpperCase() || null;
    }
    if (body.aeroport_actuel !== undefined) {
      updates.aeroport_actuel = String(body.aeroport_actuel || '').trim().toUpperCase() || null;
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucune modification.' }, { status: 400 });
    }

    const { error } = await admin.from('inventaire_avions').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/avions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 });

    const { data: row } = await admin
      .from('inventaire_avions')
      .select('id, instruction_actif, instruction_instructeur_id')
      .eq('id', id)
      .single();
    if (!row || !row.instruction_actif) {
      return NextResponse.json({ error: 'Avion temporaire introuvable.' }, { status: 404 });
    }
    if (row.instruction_instructeur_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }

    const { count: plansOuverts } = await admin
      .from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('inventaire_avion_id', id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    if ((plansOuverts ?? 0) > 0) {
      return NextResponse.json({ error: 'Cet avion est utilisé dans un plan de vol en cours.' }, { status: 400 });
    }

    const { error } = await admin.from('inventaire_avions').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/avions DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
