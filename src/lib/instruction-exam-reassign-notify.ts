import type { SupabaseClient } from '@supabase/supabase-js';
import { getExaminerPoolUserIds, isAtcSideExamRequest } from '@/lib/instruction-permissions';

/** Met en cache le pool par « famille » d’examen (vol vs ATC) pour les traitements en lot. */
export async function getCachedExaminerPool(
  admin: SupabaseClient,
  licenceCode: string,
  cache: { flight: string[] | null; atc: string[] | null },
): Promise<string[]> {
  if (isAtcSideExamRequest(licenceCode)) {
    if (!cache.atc) {
      cache.atc = await getExaminerPoolUserIds(admin, 'CAL-ATC');
    }
    return cache.atc;
  }
  if (!cache.flight) {
    cache.flight = await getExaminerPoolUserIds(admin, 'PPL');
  }
  return cache.flight;
}

/**
 * Messages messagerie : candidat, nouvel examinateur, ancien examinateur (si différent).
 * expediteurId = compte émetteur (admin ou examinateur qui a déclenché l’action).
 */
export async function notifyExamInstructorReassignment(
  admin: SupabaseClient,
  opts: {
    expediteurId: string;
    licenceCode: string;
    requesterId: string;
    oldInstructorId: string | null;
    newInstructorId: string;
    raison: 'refus' | 'admin_batch' | 'reassign_examinateur';
  },
): Promise<void> {
  if (opts.oldInstructorId === opts.newInstructorId) return;

  const idList = [opts.requesterId, opts.newInstructorId, opts.oldInstructorId].filter(
    (x): x is string => Boolean(x),
  );
  const uniqueIds = Array.from(new Set(idList));

  const { data: profs } = await admin.from('profiles').select('id, identifiant').in('id', uniqueIds);
  const ident = new Map((profs || []).map((p) => [p.id as string, p.identifiant as string]));

  const reqIdent = ident.get(opts.requesterId) || '?';
  const newIdent = ident.get(opts.newInstructorId) || '?';
  const oldIdent = opts.oldInstructorId ? ident.get(opts.oldInstructorId) || '?' : null;

  const raisonText =
    opts.raison === 'refus'
      ? 'suite au refus de l’examinateur précédent'
      : opts.raison === 'reassign_examinateur'
        ? 'l’examinateur a volontairement transmis la demande à un collègue'
        : 'mise à jour administrative (harmonisation des assignations)';

  const toInsert: Array<{
    expediteur_id: string;
    destinataire_id: string;
    titre: string;
    contenu: string;
    type_message: string;
  }> = [];

  toInsert.push({
    expediteur_id: opts.expediteurId,
    destinataire_id: opts.requesterId,
    titre: `Examen ${opts.licenceCode} — Examinateur modifié`,
    contenu: [
      `Votre demande d'examen pour la licence **${opts.licenceCode}** a été mise à jour (${raisonText}).`,
      ``,
      oldIdent
        ? `Ancien examinateur assigné : **${oldIdent}**`
        : `Ancien examinateur : non enregistré ou réinitialisé.`,
      `Nouvel examinateur assigné : **${newIdent}**`,
      ``,
      `Conservez ce message pour référence. Pour toute question, contactez l'équipe ou votre instructeur référent.`,
    ].join('\n'),
    type_message: 'normal',
  });

  toInsert.push({
    expediteur_id: opts.expediteurId,
    destinataire_id: opts.newInstructorId,
    titre: `Examen ${opts.licenceCode} — Nouvelle assignation`,
    contenu: [
      `Une demande d'examen vous a été assignée :`,
      ``,
      `Candidat : **${reqIdent}**`,
      `Licence visée : **${opts.licenceCode}**`,
      oldIdent ? `Cette assignation remplace l'examinateur précédent (**${oldIdent}**).` : ``,
      ``,
      `Retrouvez la demande dans la page **Instruction** (demandes d'examen reçues).`,
    ]
      .filter(Boolean)
      .join('\n'),
    type_message: 'normal',
  });

  if (opts.oldInstructorId && opts.oldInstructorId !== opts.newInstructorId) {
    toInsert.push({
      expediteur_id: opts.expediteurId,
      destinataire_id: opts.oldInstructorId,
      titre: `Examen ${opts.licenceCode} — Assignation retirée`,
      contenu: [
        `La demande d'examen de **${reqIdent}** (${opts.licenceCode}) ne vous est plus assignée.`,
        `Nouvel examinateur : **${newIdent}**.`,
        ``,
        `Motif : ${raisonText}.`,
      ].join('\n'),
      type_message: 'normal',
    });
  }

  const { error } = await admin.from('messages').insert(toInsert);
  if (error) throw new Error(`Messagerie : ${error.message}`);
}
