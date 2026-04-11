import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALL_LICENCE_TYPES } from '@/lib/licence-types';

type ExamStatus = 'assigne' | 'accepte' | 'termine' | 'refuse';

function canManageInstruction(role: string | null | undefined): boolean {
  return role === 'instructeur' || role === 'admin';
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();

    const { data: mine, error: mineErr } = await admin
      .from('instruction_exam_requests')
      .select('id, requester_id, licence_code, instructeur_id, statut, message, response_note, created_at, updated_at, instructeur:profiles!instruction_exam_requests_instructeur_id_fkey(identifiant)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });
    if (mineErr) return NextResponse.json({ error: mineErr.message }, { status: 400 });

    let assigned: any[] = [];
    if (canManageInstruction(me?.role)) {
      const { data: assignedRows, error: assignedErr } = await admin
        .from('instruction_exam_requests')
        .select('id, requester_id, licence_code, instructeur_id, statut, message, response_note, created_at, updated_at, requester:profiles!instruction_exam_requests_requester_id_fkey(identifiant)')
        .eq('instructeur_id', user.id)
        .order('created_at', { ascending: false });
      if (assignedErr) return NextResponse.json({ error: assignedErr.message }, { status: 400 });
      assigned = assignedRows || [];
    }

    return NextResponse.json({ mine: mine || [], assigned });
  } catch (e) {
    console.error('instruction/exam-requests GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const licenceCode = String(body.licence_code || '').trim();
    const message = body.message ? String(body.message).trim() : null;
    if (!(ALL_LICENCE_TYPES as readonly string[]).includes(licenceCode)) {
      return NextResponse.json({ error: 'Licence invalide.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { count: existingOpen } = await admin
      .from('instruction_exam_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requester_id', user.id)
      .eq('licence_code', licenceCode)
      .in('statut', ['assigne', 'accepte']);
    if ((existingOpen ?? 0) > 0) {
      return NextResponse.json({ error: 'Une demande est déjà en cours pour cette licence.' }, { status: 400 });
    }

    const { data: instructeurs, error: instErr } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'instructeur');
    if (instErr) return NextResponse.json({ error: instErr.message }, { status: 400 });
    if (!instructeurs || instructeurs.length === 0) {
      return NextResponse.json({ error: 'Aucun instructeur disponible.' }, { status: 400 });
    }

    const instructorIds = instructeurs.map((i) => i.id);
    const pool = instructorIds.filter((id) => id !== user.id);
    const eligible = pool.length > 0 ? pool : instructorIds;

    const counts = new Map<string, number>();
    for (const id of eligible) counts.set(id, 0);
    const { data: pendingAssigned } = await admin
      .from('instruction_exam_requests')
      .select('instructeur_id')
      .in('instructeur_id', eligible)
      .in('statut', ['assigne', 'accepte']);
    for (const row of pendingAssigned || []) {
      if (!row.instructeur_id) continue;
      counts.set(row.instructeur_id, (counts.get(row.instructeur_id) || 0) + 1);
    }

    const sorted = [...eligible].sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0));
    const selectedInstructorId = sorted[0];

    const payload: { requester_id: string; licence_code: string; instructeur_id: string; statut: ExamStatus; message: string | null } = {
      requester_id: user.id,
      licence_code: licenceCode,
      instructeur_id: selectedInstructorId,
      statut: 'assigne',
      message,
    };
    const { data, error } = await admin.from('instruction_exam_requests').insert(payload).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('instruction/exam-requests POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
