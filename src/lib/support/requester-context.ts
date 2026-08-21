import type { createAdminClient } from '@/lib/supabase/admin';
import { getProgramByLicence } from '@/lib/instruction-programs';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Instantané du dossier du membre, injecté dans le prompt de SON ticket uniquement.
 *
 * Budget Groq : 8K tokens/minute pour tout l’appel. Ce bloc doit rester très court
 * (≈ 300 tokens max) : lignes `clé: valeur`, champs vides omis, listes plafonnées.
 * Aucune donnée d’un autre membre, aucun e-mail, aucun identifiant technique (UUID).
 */

const MAX_ITEMS = 3;

const ATC_QUALIFICATIONS = new Set([
  'LATC',
  'CAL-ATC',
  'PCAL-ATC',
  'CAL-AFIS',
  'PCAL-AFIS',
  'LPAFIS',
  'ATC FI',
  'ATC FE',
]);

export function atcDossierGuidance(
  profile: { atc?: boolean | null; role?: string | null; atc_grade_id?: string | null },
  licences: string[],
): string | null {
  const held = Array.from(new Set(licences.filter((licence) => ATC_QUALIFICATIONS.has(licence))));
  if (held.length === 0) return null;
  const hasAccess = profile.atc === true || profile.role === 'atc';
  if (hasAccess && profile.atc_grade_id) return null;
  const missing = [!hasAccess ? 'accès à l’espace ATC' : '', !profile.atc_grade_id ? 'grade ATC' : ''].filter(
    Boolean,
  );
  return (
    `situation ATC: qualifications déjà détenues (${held.join(', ')}) ; ${missing.join(' et ')} manquant(s). ` +
    'Ne propose pas un parcours débutant et ne prétends pas qu’une licence active automatiquement l’accès ou le grade : seul le staff ATC peut les attribuer.'
  );
}

export const NO_LINKED_ACCOUNT_CONTEXT = [
  'Dossier du membre : ce compte Discord n’est PAS lié à un compte du site.',
  'Tu n’as donc aucune donnée sur lui : n’invente rien sur ses licences, formations ou compagnie.',
  'Pour toute question liée à son compte, dis-lui de lier son Discord depuis « Mon compte » → « Identité & connexions ».',
].join('\n');

const AEROSCHOOL_STATUS: Record<string, string> = {
  submitted: 'en attente de correction',
  reviewed: 'corrigé',
  abandoned: 'abandonné',
  time_expired: 'temps écoulé',
};

const TRAINING_STATUS: Record<string, string> = {
  assigne: 'en attente de l’instructeur',
  accepte: 'accepté',
  en_cours: 'session en cours',
};

const EXAM_STATUS: Record<string, string> = {
  assigne: 'assigné',
  accepte: 'accepté',
  en_cours: 'en cours',
  termine: 'terminé',
  refuse: 'refusé',
};

function firstRelation<T>(rel: unknown): T | null {
  if (Array.isArray(rel)) return (rel[0] as T) ?? null;
  if (rel && typeof rel === 'object') return rel as T;
  return null;
}

/** Construit le bloc « Dossier du membre » pour l’IA. Ne jette jamais : le ticket doit répondre. */
export async function buildRequesterContext(admin: Admin, userId: string | null | undefined): Promise<string> {
  if (!userId) return NO_LINKED_ACCOUNT_CONTEXT;

  try {
    const [
      profileRes,
      licencesRes,
      qcmRes,
      atcTrainingRes,
      pilotTrainingRes,
      examRes,
      emploiRes,
      invitRes,
    ] = await Promise.all([
      admin
        .from('profiles')
        .select(
          'identifiant, role, callsign, email, atc, armee, ifsa, siavi, ground_crew, atc_grade_id, formation_instruction_active, formation_instruction_licence, instructeur_referent_id, sanction_blocage_vol',
        )
        .eq('id', userId)
        .maybeSingle(),
      admin.from('licences_qualifications').select('type, langue').eq('user_id', userId),
      admin
        .from('aeroschool_responses')
        .select('form_id, status, score, max_score, submitted_at')
        .eq('user_id', userId)
        .neq('status', 'trashed')
        .order('submitted_at', { ascending: false })
        .limit(MAX_ITEMS),
      admin
        .from('instruction_atc_training_requests')
        .select('licence_code, assignee_id')
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_ITEMS),
      admin
        .from('instruction_pilot_training_requests')
        .select('licence_code, statut, assignee_id')
        .eq('requester_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_ITEMS),
      admin
        .from('instruction_exam_requests')
        .select('licence_code, statut, resultat, instructeur_id')
        .eq('requester_id', userId)
        .in('statut', ['assigne', 'accepte', 'en_cours'])
        .order('created_at', { ascending: false })
        .limit(MAX_ITEMS),
      admin.from('compagnie_employes').select('role, compagnies(nom)').eq('pilote_id', userId),
      admin
        .from('compagnie_invitations')
        .select('compagnies(nom)')
        .eq('pilote_id', userId)
        .eq('statut', 'en_attente')
        .limit(MAX_ITEMS),
    ]);

    const profile = profileRes.data;
    if (!profile) return NO_LINKED_ACCOUNT_CONTEXT;

    const peopleIds = new Set<string>();
    if (profile.instructeur_referent_id) peopleIds.add(String(profile.instructeur_referent_id));
    for (const r of atcTrainingRes.data || []) if (r.assignee_id) peopleIds.add(String(r.assignee_id));
    for (const r of pilotTrainingRes.data || []) if (r.assignee_id) peopleIds.add(String(r.assignee_id));
    for (const r of examRes.data || []) if (r.instructeur_id) peopleIds.add(String(r.instructeur_id));

    const formIds = Array.from(
      new Set((qcmRes.data || []).map((r) => String(r.form_id)).filter(Boolean)),
    );
    const formationLicence = profile.formation_instruction_active
      ? (profile.formation_instruction_licence as string | null)
      : null;

    const [gradeRes, peopleRes, formsRes, progressionRes] = await Promise.all([
      profile.atc_grade_id
        ? admin.from('atc_grades').select('nom').eq('id', profile.atc_grade_id).maybeSingle()
        : Promise.resolve({ data: null }),
      peopleIds.size
        ? admin.from('profiles').select('id, identifiant').in('id', Array.from(peopleIds))
        : Promise.resolve({ data: [] as Array<{ id: string; identifiant: string }> }),
      formIds.length
        ? admin.from('aeroschool_forms').select('id, title').in('id', formIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
      formationLicence
        ? admin
            .from('instruction_progression_items')
            .select('module_code')
            .eq('eleve_id', userId)
            .eq('licence_code', formationLicence)
            .eq('completed', true)
        : Promise.resolve({ data: [] as Array<{ module_code: string }> }),
    ]);

    const nameById = new Map(
      ((peopleRes.data || []) as Array<{ id: string; identifiant: string }>).map((p) => [
        String(p.id),
        String(p.identifiant),
      ]),
    );
    const formTitleById = new Map(
      ((formsRes.data || []) as Array<{ id: string; title: string }>).map((f) => [
        String(f.id),
        String(f.title),
      ]),
    );

    const lines: string[] = [
      'Dossier du membre (données réelles du site, valables pour CE ticket uniquement) :',
    ];

    const head = [`identifiant: ${profile.identifiant || '?'}`, `rôle: ${profile.role || 'pilote'}`];
    if (profile.callsign) head.push(`callsign: ${profile.callsign}`);
    lines.push(head.join(' | '));

    const acces: string[] = [];
    if (profile.atc || profile.role === 'atc') {
      const grade = (gradeRes.data as { nom?: string } | null)?.nom;
      acces.push(grade ? `ATC (grade ${grade})` : 'ATC (aucun grade attribué)');
    }
    if (profile.armee) acces.push('militaire');
    if (profile.ifsa) acces.push('IFSA');
    if (profile.siavi) acces.push('SIAVI');
    if (profile.ground_crew) acces.push('ground crew');
    if (acces.length) lines.push(`accès: ${acces.join(', ')}`);
    if (!profile.email) lines.push('e-mail du compte: non renseigné (codes e-mail impossibles)');
    if (profile.sanction_blocage_vol) lines.push('sanction en cours: vol bloqué');

    const licences = (licencesRes.data || [])
      .map((l) => (l.langue ? `${l.type} (${l.langue})` : String(l.type)))
      .filter(Boolean);
    lines.push(
      licences.length
        ? `licences détenues: ${Array.from(new Set(licences)).join(', ')}`
        : 'licences détenues: aucune',
    );
    const atcGuidance = atcDossierGuidance(
      profile,
      (licencesRes.data || []).map((licence) => String(licence.type)),
    );
    if (atcGuidance) lines.push(atcGuidance);

    if (formationLicence) {
      const program = getProgramByLicence(formationLicence);
      const done = (progressionRes.data || []).length;
      const total = program?.modules.length ?? 0;
      const referent = profile.instructeur_referent_id
        ? nameById.get(String(profile.instructeur_referent_id))
        : null;
      lines.push(
        `formation en cours: ${program?.label || formationLicence}` +
          (total ? ` — ${done}/${total} modules` : '') +
          (referent ? ` — référent ${referent}` : ''),
      );
    }

    const qcm = (qcmRes.data || []).map((r) => {
      const title = formTitleById.get(String(r.form_id)) || 'QCM';
      const etat = AEROSCHOOL_STATUS[String(r.status)] || String(r.status);
      const note =
        r.status === 'reviewed' && r.score != null && r.max_score != null
          ? ` ${r.score}/${r.max_score}`
          : '';
      return `${title} = ${etat}${note}`;
    });
    if (qcm.length) lines.push(`QCM AeroSchool récents: ${qcm.join(' ; ')}`);

    const atcTr = (atcTrainingRes.data || []).map((r) => {
      const who = r.assignee_id ? nameById.get(String(r.assignee_id)) : null;
      return `${r.licence_code || '?'}${who ? ` avec ${who}` : ''}`;
    });
    if (atcTr.length) lines.push(`demande(s) de training ATC en cours: ${atcTr.join(' ; ')}`);

    const pilotTr = (pilotTrainingRes.data || []).map((r) => {
      const who = r.assignee_id ? nameById.get(String(r.assignee_id)) : null;
      const etat = TRAINING_STATUS[String(r.statut)] || String(r.statut || 'en attente');
      return `${r.licence_code || '?'} (${etat})${who ? ` avec ${who}` : ''}`;
    });
    if (pilotTr.length) lines.push(`demande(s) de training vol en cours: ${pilotTr.join(' ; ')}`);

    const exams = (examRes.data || []).map((r) => {
      const who = r.instructeur_id ? nameById.get(String(r.instructeur_id)) : null;
      const etat = EXAM_STATUS[String(r.statut)] || String(r.statut);
      return `${r.licence_code || '?'} (${etat})${who ? ` avec ${who}` : ''}`;
    });
    if (exams.length) lines.push(`examen(s) en cours: ${exams.join(' ; ')}`);

    const emplois = (emploiRes.data || [])
      .map((e) => {
        const cie = firstRelation<{ nom?: string }>(e.compagnies)?.nom;
        return cie ? `${cie} (${e.role === 'co_pdg' ? 'co-PDG' : 'employé'})` : null;
      })
      .filter(Boolean) as string[];
    if (emplois.length) lines.push(`compagnie: ${emplois.join(', ')}`);

    const invits = (invitRes.data || [])
      .map((i) => firstRelation<{ nom?: string }>(i.compagnies)?.nom)
      .filter(Boolean) as string[];
    if (invits.length) lines.push(`invitation(s) compagnie en attente: ${invits.join(', ')}`);

    lines.push(
      'Appuie-toi sur ces faits pour répondre précisément. N’invente aucun autre fait sur lui : si une info te manque, demande-la ou passe la main.',
    );

    return lines.join('\n');
  } catch (e) {
    console.error('[support-message] dossier membre indisponible', e);
    return 'Dossier du membre : indisponible pour le moment. Ne suppose rien sur son compte, demande-lui les informations nécessaires.';
  }
}
