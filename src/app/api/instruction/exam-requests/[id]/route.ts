import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const VALID_STATUSES = ['assigne', 'accepte', 'termine', 'refuse'] as const;

function canManageInstruction(role: string | null | undefined): boolean {
  return role === 'instructeur' || role === 'admin';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!canManageInstruction(me?.role)) {
      return NextResponse.json({ error: 'Réservé aux instructeurs.' }, { status: 403 });
    }

    const { data: row } = await admin
      .from('instruction_exam_requests')
      .select('id, instructeur_id')
      .eq('id', id)
      .single();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (row.instructeur_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Vous n’êtes pas l’instructeur assigné.' }, { status: 403 });
    }

    const body = await request.json();
    const statut = String(body.statut || '').trim();
    const responseNote = body.response_note != null ? String(body.response_note).trim() : null;
    if (!(VALID_STATUSES as readonly string[]).includes(statut)) {
      return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
    }

    const { error } = await admin
      .from('instruction_exam_requests')
      .update({
        statut,
        response_note: responseNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/exam-requests/[id] PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
