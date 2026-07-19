export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity-log';
import { recordTrainingCompletion } from '@/lib/instruction-exam-rules';
import { notifyUser } from '@/lib/notifications';
import {
  activateFictiveAircraftForSession,
  removeFictiveAircraftForSession,
} from '@/lib/instruction-fictive-aircraft';

const VALID_STATUTS = ['assigne', 'accepte', 'en_cours', 'termine', 'refuse'] as const;

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
    const statut = body.statut != null ? String(body.statut).trim() : '';

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();

    const { data: row } = await admin
      .from('instruction_pilot_training_requests')
      .select('id, requester_id, assignee_id, licence_code, statut')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (row.assignee_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Seul l’instructeur assigné peut gérer cette session.' }, { status: 403 });
    }

    // ── Clôture (historique + suppression demande) ──
    if (action === 'termine') {
      if (row.statut !== 'en_cours') {
        return NextResponse.json({ error: 'La session doit être en cours pour être clôturée.' }, { status: 400 });
      }
      if (!row.licence_code) {
        return NextResponse.json(
          { error: 'Cette session n’a pas de licence associée. Annulez-la et demandez une nouvelle session avec la licence visée.' },
          { status: 400 },
        );
      }

      try {
        await removeFictiveAircraftForSession(admin, 'pilot_training', id);
      } catch (planeErr) {
        console.error('removeFictiveAircraftForSession pilot training termine:', planeErr);
        return NextResponse.json(
          { error: planeErr instanceof Error ? planeErr.message : 'Erreur retrait avion fictif.' },
          { status: 400 },
        );
      }

      await recordTrainingCompletion(admin, {
        requesterId: row.requester_id as string,
        licenceCode: row.licence_code as string,
        instructorId: row.assignee_id as string,
      });

      const { error: delErr } = await admin.from('instruction_pilot_training_requests').delete().eq('id', id);
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

      logActivity({
        userId: user.id,
        action: 'pilot_training_completed',
        targetType: 'pilot_training',
        targetId: id,
        details: { requester_id: row.requester_id, licence_code: row.licence_code },
      });
      return NextResponse.json({ ok: true });
    }

    if (!statut || !(VALID_STATUTS as readonly string[]).includes(statut)) {
      return NextResponse.json({ error: 'Statut invalide ou action inconnue.' }, { status: 400 });
    }

    // ── Démarrer la session (accepte → en_cours) ──
    if (statut === 'en_cours') {
      if (row.statut !== 'accepte') {
        return NextResponse.json({ error: 'La demande doit être acceptée avant de démarrer la session.' }, { status: 400 });
      }
      const { error } = await admin
        .from('instruction_pilot_training_requests')
        .update({ statut: 'en_cours', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      try {
        await activateFictiveAircraftForSession(admin, 'pilot_training', id);
      } catch (planeErr) {
        console.error('activateFictiveAircraftForSession pilot training:', planeErr);
        return NextResponse.json(
          { error: planeErr instanceof Error ? planeErr.message : 'Erreur activation avion fictif.' },
          { status: 400 },
        );
      }
      try {
        await notifyUser(row.requester_id as string, {
          type: 'pilot_training_started',
          title: `Training ${row.licence_code} démarré`,
          body: `${me?.identifiant ?? 'Votre instructeur'} a démarré la session de training ${row.licence_code}.`,
          link: '/instruction',
        });
      } catch (e) { console.error('notifyUser pilot_training_started:', e); }
      return NextResponse.json({ ok: true });
    }

    // ── Acceptation ──
    if (statut === 'accepte') {
      if (row.statut !== 'assigne') {
        return NextResponse.json({ error: 'Seule une demande en attente peut être acceptée.' }, { status: 400 });
      }
      const { error } = await admin
        .from('instruction_pilot_training_requests')
        .update({ statut: 'accepte', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      try {
        await notifyUser(row.requester_id as string, {
          type: 'pilot_training_accepted',
          title: `Training ${row.licence_code} accepté`,
          body: `${me?.identifiant ?? 'Votre instructeur'} a accepté votre session de training ${row.licence_code}.`,
          link: '/instruction',
        });
      } catch (e) { console.error('notifyUser pilot_training_accepted:', e); }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Transition non supportée.' }, { status: 400 });
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
      .select('id, requester_id, assignee_id, licence_code, statut')
      .eq('id', id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });

    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const isAdmin = me?.role === 'admin';
    if (row.requester_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Seul le demandeur ou un administrateur peut annuler.' }, { status: 403 });
    }

    if (row.statut === 'en_cours') {
      return NextResponse.json({ error: 'Impossible d\'annuler une session en cours.' }, { status: 400 });
    }

    try {
      await removeFictiveAircraftForSession(admin, 'pilot_training', id);
    } catch (planeErr) {
      console.error('removeFictiveAircraftForSession pilot training cancel:', planeErr);
      return NextResponse.json(
        { error: planeErr instanceof Error ? planeErr.message : 'Erreur retrait avion fictif.' },
        { status: 400 },
      );
    }

    const { error } = await admin.from('instruction_pilot_training_requests').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: isAdmin ? 'admin_cancel_pilot_training' : 'cancel_pilot_training',
      targetType: 'pilot_training',
      targetId: id,
      details: {
        requester_id: row.requester_id,
        assignee_id: row.assignee_id,
        licence_code: row.licence_code,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/pilot-trainings/[id] DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
