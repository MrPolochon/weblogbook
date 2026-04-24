import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity, getClientIp } from '@/lib/activity-log';
import { getExaminerPoolUserIds, userCanConcludeThisExam } from '@/lib/instruction-permissions';

const VALID_STATUSES = ['assigne', 'accepte', 'en_cours', 'termine', 'refuse'] as const;

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
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();

    const { data: row } = await admin
      .from('instruction_exam_requests')
      .select('id, instructeur_id, requester_id, statut, licence_code')
      .eq('id', id)
      .single();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
    if (me?.role !== 'admin') {
      if (row.instructeur_id !== user.id) {
        return NextResponse.json({ error: 'Vous n\'êtes pas l\'examinateur assigné.' }, { status: 403 });
      }
      if (!(await userCanConcludeThisExam(admin, user.id, me?.role, row.licence_code))) {
        return NextResponse.json(
          { error: 'Votre habilitation ne permet pas de conclure ce type d\'examen (FE vol / ATC FE pour examens ATC).' },
          { status: 403 },
        );
      }
    }

    const body = await request.json();
    const statut = String(body.statut || '').trim();
    const responseNote = body.response_note != null ? String(body.response_note).trim() : null;
    if (!(VALID_STATUSES as readonly string[]).includes(statut)) {
      return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
    }

    // ── Démarrer la session (accepte → en_cours) ──
    if (statut === 'en_cours') {
      if (row.statut !== 'accepte') {
        return NextResponse.json({ error: 'La demande doit être acceptée avant de démarrer la session.' }, { status: 400 });
      }
      const { error } = await admin
        .from('instruction_exam_requests')
        .update({ statut: 'en_cours', response_note: responseNote, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      logActivity({ userId: user.id, userIdentifiant: me?.identifiant, action: 'exam_start_session', targetType: 'exam_request', targetId: id, details: { licence_code: row.licence_code, requester_id: row.requester_id }, ip: getClientIp(request) });
      return NextResponse.json({ ok: true });
    }

    // ── Terminer avec résultat ──
    if (statut === 'termine') {
      if (row.statut !== 'en_cours') {
        return NextResponse.json({ error: 'La session doit être en cours pour la terminer.' }, { status: 400 });
      }

      const resultat = String(body.resultat || '').trim();
      if (resultat !== 'reussi' && resultat !== 'echoue') {
        return NextResponse.json({ error: 'Résultat requis: reussi ou echoue.' }, { status: 400 });
      }

      const { data: requesterProfile } = await admin
        .from('profiles')
        .select('identifiant')
        .eq('id', row.requester_id)
        .single();

      // ── RÉUSSI ──
      if (resultat === 'reussi') {
        const { a_vie, date_delivrance, date_expiration, note, type_avion_id, langue } = body;

        if (!date_delivrance) {
          return NextResponse.json({ error: 'Date de délivrance requise.' }, { status: 400 });
        }
        if (!a_vie && !date_expiration) {
          return NextResponse.json({ error: 'Date d\'expiration requise (ou cochez "à vie").' }, { status: 400 });
        }

        const licenceRow: Record<string, unknown> = {
          user_id: row.requester_id,
          type: row.licence_code,
          a_vie: Boolean(a_vie),
          date_delivrance: String(date_delivrance),
          created_by: user.id,
        };
        if (a_vie) {
          licenceRow.date_expiration = null;
        } else if (date_expiration) {
          licenceRow.date_expiration = String(date_expiration);
        }
        if (note) licenceRow.note = String(note).trim();
        if (type_avion_id) licenceRow.type_avion_id = type_avion_id;
        if (langue) licenceRow.langue = String(langue).trim();

        const { data: licence, error: licErr } = await admin
          .from('licences_qualifications')
          .insert(licenceRow)
          .select('id, type, a_vie, date_delivrance, date_expiration, note')
          .single();
        if (licErr) return NextResponse.json({ error: `Erreur création licence: ${licErr.message}` }, { status: 400 });

        const { error: updateErr } = await admin
          .from('instruction_exam_requests')
          .update({
            statut: 'termine',
            resultat: 'reussi',
            response_note: responseNote,
            licence_creee_id: licence.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

        const expirationText = licence.a_vie
          ? 'À vie'
          : `Expire le ${licence.date_expiration || 'N/A'}`;

        await admin.from('messages').insert({
          expediteur_id: user.id,
          destinataire_id: row.requester_id,
          type_message: 'normal',
          titre: `Examen ${row.licence_code} — Réussi`,
          contenu: [
            `Félicitations ! Vous avez réussi votre examen ${row.licence_code}.`,
            ``,
            `Votre licence vous a été délivrée par ${me?.identifiant || 'votre instructeur'}.`,
            ``,
            `── Détails de la licence ──`,
            `Type : ${licence.type}`,
            `Date de délivrance : ${licence.date_delivrance}`,
            `Validité : ${expirationText}`,
            licence.note ? `Note : ${licence.note}` : '',
            ``,
            `Vous pouvez consulter vos licences dans votre profil.`,
          ].filter(Boolean).join('\n'),
        });

        logActivity({ userId: user.id, userIdentifiant: me?.identifiant, action: 'exam_passed', targetType: 'exam_request', targetId: id, details: { licence_code: row.licence_code, requester_id: row.requester_id, licence_id: licence.id }, ip: getClientIp(request) });
        return NextResponse.json({ ok: true, licence_id: licence.id });
      }

      // ── ÉCHOUÉ ──
      const dossierConserve = Boolean(body.dossier_conserve);

      const { error: updateErr } = await admin
        .from('instruction_exam_requests')
        .update({
          statut: 'termine',
          resultat: 'echoue',
          dossier_conserve: dossierConserve,
          response_note: responseNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

      const messageEchec = dossierConserve
        ? `Votre dossier a été conservé. Contactez l'instructeur ${me?.identifiant || ''} pour repasser l'examen.`
        : `Votre dossier n'a pas été conservé. Vous pouvez refaire une nouvelle demande d'examen.`;

      await admin.from('messages').insert({
        expediteur_id: user.id,
        destinataire_id: row.requester_id,
        type_message: 'normal',
        titre: `Examen ${row.licence_code} — Échoué`,
        contenu: [
          `Malheureusement, vous n'avez pas réussi votre examen ${row.licence_code}.`,
          ``,
          responseNote ? `Note de l'instructeur : ${responseNote}` : '',
          ``,
          messageEchec,
        ].filter(Boolean).join('\n'),
      });

      if (!dossierConserve) {
        await admin
          .from('instruction_exam_requests')
          .delete()
          .eq('id', id);
      }

      logActivity({ userId: user.id, userIdentifiant: me?.identifiant, action: 'exam_failed', targetType: 'exam_request', targetId: id, details: { licence_code: row.licence_code, requester_id: row.requester_id, dossier_conserve: dossierConserve }, ip: getClientIp(request) });
      return NextResponse.json({ ok: true });
    }

    // ── Refus → réassigner à un autre instructeur ──
    if (statut === 'refuse') {
      if (row.statut !== 'assigne') {
        return NextResponse.json({ error: 'Seule une demande en attente peut être refusée.' }, { status: 400 });
      }

      const poolIds = await getExaminerPoolUserIds(admin, row.licence_code);
      const refusedBy = user.id;
      const { data: previousRefusals } = await admin
        .from('instruction_exam_request_refusals')
        .select('instructeur_id')
        .eq('request_id', id);
      const alreadyRefusedIds = new Set((previousRefusals || []).map((r: { instructeur_id: string }) => r.instructeur_id));
      alreadyRefusedIds.add(refusedBy);

      await admin.from('instruction_exam_request_refusals').insert({
        request_id: id,
        instructeur_id: refusedBy,
      });

      const eligible = poolIds.filter((iid) => iid !== row.requester_id && !alreadyRefusedIds.has(iid));

      if (eligible.length > 0) {
        const workload = new Map<string, number>();
        for (const iid of eligible) workload.set(iid, 0);

        const { data: pendingAssigned } = await admin
          .from('instruction_exam_requests')
          .select('instructeur_id')
          .in('instructeur_id', eligible)
          .in('statut', ['assigne', 'accepte', 'en_cours']);
        for (const r of pendingAssigned || []) {
          if (!r.instructeur_id) continue;
          workload.set(r.instructeur_id, (workload.get(r.instructeur_id) || 0) + 1);
        }

        const sorted = [...eligible].sort((a, b) => (workload.get(a) || 0) - (workload.get(b) || 0));
        const newInstructorId = sorted[0];

        const { error } = await admin
          .from('instruction_exam_requests')
          .update({
            instructeur_id: newInstructorId,
            statut: 'assigne',
            response_note: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, reassigned: true });
      }

      const { error } = await admin
        .from('instruction_exam_requests')
        .update({
          statut: 'refuse',
          response_note: responseNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await admin.from('messages').insert({
        expediteur_id: null,
        destinataire_id: row.requester_id,
        type_message: 'normal',
        titre: `Examen ${row.licence_code} — Aucun instructeur disponible`,
        contenu: `Votre demande d'examen ${row.licence_code} n'a pas pu être assignée : tous les instructeurs ont décliné. Veuillez réessayer plus tard.`,
      });

      return NextResponse.json({ ok: true, reassigned: false });
    }

    // ── Transition simple (assigne → accepte) ──
    const update: Record<string, unknown> = {
      statut,
      response_note: responseNote,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin
      .from('instruction_exam_requests')
      .update(update)
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/exam-requests/[id] PATCH:', e);
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
      .from('instruction_exam_requests')
      .select('id, requester_id, statut, licence_code')
      .eq('id', id)
      .single();
    if (!row) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });

    if (row.requester_id !== user.id) {
      const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (me?.role !== 'admin') return NextResponse.json({ error: 'Vous ne pouvez annuler que vos propres demandes.' }, { status: 403 });
    }

    if (row.statut === 'en_cours') {
      return NextResponse.json({ error: 'Impossible d\'annuler une session en cours.' }, { status: 400 });
    }
    if (row.statut === 'termine') {
      return NextResponse.json({ error: 'Cette demande est déjà terminée.' }, { status: 400 });
    }

    await admin.from('instruction_exam_request_refusals').delete().eq('request_id', id);
    await admin.from('instruction_exam_requests').delete().eq('id', id);

    logActivity({ userId: user.id, action: 'cancel_exam_request', targetType: 'exam_request', targetId: id, details: { licence_code: row.licence_code } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/exam-requests/[id] DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
