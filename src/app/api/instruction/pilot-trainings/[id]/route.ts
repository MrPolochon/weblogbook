import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity-log';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const action = String(body.action || '').trim();
    if (action !== 'termine') {
      return NextResponse.json({ error: 'Action inconnue (utilisez termine).' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('instruction_pilot_training_requests')
      .select('id, requester_id, assignee_id')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (row.assignee_id !== user.id) {
      return NextResponse.json({ error: 'Seul l’instructeur assigné peut clôturer la session.' }, { status: 403 });
    }

    const { error: delErr } = await admin.from('instruction_pilot_training_requests').delete().eq('id', id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      action: 'pilot_training_completed',
      targetType: 'pilot_training',
      targetId: id,
      details: { requester_id: row.requester_id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/pilot-trainings/[id] PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: row } = await admin
      .from('instruction_pilot_training_requests')
      .select('id, requester_id')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (row.requester_id !== user.id) {
      const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (me?.role !== 'admin') {
        return NextResponse.json({ error: 'Seul le demandeur peut annuler.' }, { status: 403 });
      }
    }

    const { error } = await admin.from('instruction_pilot_training_requests').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/pilot-trainings/[id] DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
