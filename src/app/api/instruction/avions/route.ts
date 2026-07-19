export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canAccessInstructionManagerTools,
  getInstructionCapabilities,
} from '@/lib/instruction-permissions';
import {
  type InstructionSessionKind,
  OPEN_EXAM_STATUTS,
  OPEN_PILOT_TRAINING_STATUTS,
} from '@/lib/instruction-fictive-aircraft';

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

async function assertInstructorOwnsOpenSession(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  isAdmin: boolean,
  sessionKind: InstructionSessionKind,
  sessionId: string,
): Promise<{ requesterId: string } | { error: string; status: number }> {
  if (sessionKind === 'exam') {
    const { data: row } = await admin
      .from('instruction_exam_requests')
      .select('id, requester_id, instructeur_id, statut, licence_code')
      .eq('id', sessionId)
      .maybeSingle();
    if (!row) return { error: 'Session d\'examen introuvable.', status: 404 };
    if (row.instructeur_id !== userId && !isAdmin) {
      return { error: 'Vous n\'êtes pas l\'examinateur assigné à cette session.', status: 403 };
    }
    if (!(OPEN_EXAM_STATUTS as readonly string[]).includes(String(row.statut))) {
      return { error: 'Cette session d\'examen n\'est plus ouverte.', status: 400 };
    }
    return { requesterId: row.requester_id as string };
  }

  const { data: row } = await admin
    .from('instruction_pilot_training_requests')
    .select('id, requester_id, assignee_id, statut, licence_code')
    .eq('id', sessionId)
    .maybeSingle();
  if (!row) return { error: 'Session de training introuvable.', status: 404 };
  if (row.assignee_id !== userId && !isAdmin) {
    return { error: 'Vous n\'êtes pas l\'instructeur assigné à cette session.', status: 403 };
  }
  if (!(OPEN_PILOT_TRAINING_STATUTS as readonly string[]).includes(String(row.statut))) {
    return { error: 'Cette session de training n\'est plus ouverte.', status: 400 };
  }
  return { requesterId: row.requester_id as string };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const sessionKind = String(searchParams.get('session_kind') || '').trim() as InstructionSessionKind;
    const sessionId = String(searchParams.get('session_id') || '').trim();
    if (!sessionKind || !sessionId) {
      return NextResponse.json({ error: 'session_kind et session_id requis.' }, { status: 400 });
    }
    if (sessionKind !== 'exam' && sessionKind !== 'pilot_training') {
      return NextResponse.json({ error: 'session_kind invalide.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap) && !cap.canViewExaminerInbox) {
      return NextResponse.json({ error: 'Réservé aux formateurs / examinateurs.' }, { status: 403 });
    }

    const sessionCheck = await assertInstructorOwnsOpenSession(
      admin,
      user.id,
      me?.role === 'admin',
      sessionKind,
      sessionId,
    );
    if ('error' in sessionCheck) {
      return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
    }

    const { data: rows, error } = await admin
      .from('inventaire_avions')
      .select(
        'id, type_avion_id, nom_personnalise, immatriculation, aeroport_actuel, statut, usure_percent, instruction_actif, instruction_lifecycle, instruction_session_kind, instruction_session_id, types_avion(id, nom, code_oaci)',
      )
      .eq('instruction_actif', true)
      .eq('instruction_session_kind', sessionKind)
      .eq('instruction_session_id', sessionId)
      .in('instruction_lifecycle', ['brouillon', 'actif'])
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
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap) && !cap.canViewExaminerInbox) {
      return NextResponse.json({ error: 'Réservé aux formateurs / examinateurs.' }, { status: 403 });
    }

    const body = await request.json();
    const sessionKind = String(body.session_kind || '').trim() as InstructionSessionKind;
    const sessionId = String(body.session_id || '').trim();
    const typeAvionId = String(body.type_avion_id || '');
    const nomPersonnalise = body.nom_personnalise ? String(body.nom_personnalise).trim() : null;
    let immat = body.immatriculation ? String(body.immatriculation).trim().toUpperCase() : '';

    if (!sessionKind || !sessionId || !typeAvionId) {
      return NextResponse.json({ error: 'session_kind, session_id et type_avion_id requis.' }, { status: 400 });
    }
    if (sessionKind !== 'exam' && sessionKind !== 'pilot_training') {
      return NextResponse.json({ error: 'session_kind invalide (exam ou pilot_training).' }, { status: 400 });
    }

    const sessionCheck = await assertInstructorOwnsOpenSession(
      admin,
      user.id,
      me?.role === 'admin',
      sessionKind,
      sessionId,
    );
    if ('error' in sessionCheck) {
      return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
    }
    const { requesterId } = sessionCheck;

    if (!immat) {
      immat = await generateUniqueImmat(admin);
    }

    const { data: insertRow, error } = await admin
      .from('inventaire_avions')
      .insert({
        proprietaire_id: requesterId,
        type_avion_id: typeAvionId,
        nom_personnalise: nomPersonnalise,
        immatriculation: immat,
        aeroport_actuel: 'IRFD',
        usure_percent: 100,
        statut: 'ground',
        instruction_instructeur_id: user.id,
        instruction_eleve_id: requesterId,
        instruction_actif: true,
        instruction_session_kind: sessionKind,
        instruction_session_id: sessionId,
        instruction_lifecycle: 'brouillon',
      })
      .select('id, instruction_lifecycle')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: insertRow.id, lifecycle: insertRow.instruction_lifecycle });
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
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap) && !cap.canViewExaminerInbox) {
      return NextResponse.json({ error: 'Réservé aux formateurs / examinateurs.' }, { status: 403 });
    }

    const body = await request.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 });

    const { data: row } = await admin
      .from('inventaire_avions')
      .select('id, instruction_actif, instruction_instructeur_id, instruction_lifecycle, instruction_session_kind, instruction_session_id')
      .eq('id', id)
      .single();
    if (!row || !row.instruction_actif) {
      return NextResponse.json({ error: 'Avion fictif introuvable.' }, { status: 404 });
    }
    if (row.instruction_instructeur_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }
    if (row.instruction_lifecycle === 'supprime') {
      return NextResponse.json({ error: 'Cet avion fictif a déjà été retiré.' }, { status: 400 });
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
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap) && !cap.canViewExaminerInbox) {
      return NextResponse.json({ error: 'Réservé aux formateurs / examinateurs.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '');
    if (!id) return NextResponse.json({ error: 'id requis.' }, { status: 400 });

    const { data: row } = await admin
      .from('inventaire_avions')
      .select('id, instruction_actif, instruction_instructeur_id, instruction_lifecycle')
      .eq('id', id)
      .single();
    if (!row || !row.instruction_actif) {
      return NextResponse.json({ error: 'Avion fictif introuvable.' }, { status: 404 });
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
