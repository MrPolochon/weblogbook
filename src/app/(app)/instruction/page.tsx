import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import InstructionClient from './InstructionClient';
import { INSTRUCTION_PROGRAMS, ATC_INIT_LICENCE_CODE } from '@/lib/instruction-programs';
import { ALL_LICENCE_TYPES } from '@/lib/licence-types';
import { getInstructionCapabilities, canAccessInstructionManagerTools } from '@/lib/instruction-permissions';

export default async function InstructionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const errors: string[] = [];

  // Fetch base profile and instruction columns in parallel
  const [profileBaseResult, profileInstructionResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, identifiant, role')
      .eq('id', user.id)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('formation_instruction_active, formation_instruction_licence, instructeur_referent_id')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  if (profileBaseResult.error) errors.push(`Profil: ${profileBaseResult.error.message}`);
  if (profileInstructionResult.error) errors.push(`Profil instruction: ${profileInstructionResult.error.message}`);

  const meBase = profileBaseResult.data;
  const meInstruction = profileInstructionResult.data;

  const viewer = {
    id: meBase?.id || user.id,
    identifiant: meBase?.identifiant || user.email || 'pilote',
    role: meBase?.role || 'pilote',
    formation_instruction_active: Boolean(meInstruction?.formation_instruction_active),
    formation_instruction_licence: (meInstruction?.formation_instruction_licence as string | null) || null,
    instructeur_referent_id: (meInstruction?.instructeur_referent_id as string | null) || null,
  };

  const cap = await getInstructionCapabilities(admin, user.id, viewer.role);
  const isManager = canAccessInstructionManagerTools(cap);
  const canViewExaminerInbox = cap.canViewExaminerInbox;
  const isAtcTrainingInstructor = cap.isAtcTrainingInstructor;
  const createFormationPrograms = INSTRUCTION_PROGRAMS.filter((p) => {
    if (p.licenceCode === ATC_INIT_LICENCE_CODE) return cap.canManageAtcInstruction;
    return cap.canManageFlightInstruction;
  });
  const EXAM_LICENCE_FILTER = new Set(['FI', 'FE', 'ATC FI', 'ATC FE']);
  const examLicenceOptions = ALL_LICENCE_TYPES.filter((t) => !EXAM_LICENCE_FILTER.has(t));

  const canGrantTitreInstructionFlight = viewer.role === 'admin' || cap.types.has('FE');
  const canGrantTitreInstructionAtc = viewer.role === 'admin' || cap.types.has('ATC FE');
  const showTitreDelivrance = canGrantTitreInstructionFlight || canGrantTitreInstructionAtc;
  const titresCiblesPilotesQuery = showTitreDelivrance
    ? viewer.role === 'admin'
      ? admin.from('profiles').select('id, identifiant').order('identifiant', { ascending: true })
      : admin
          .from('profiles')
          .select('id, identifiant')
          .eq('instructeur_referent_id', user.id)
          .eq('formation_instruction_active', true)
          .order('identifiant', { ascending: true })
    : Promise.resolve({ data: [] as Array<{ id: string; identifiant: string }>, error: null });

  // Batch all independent queries together
  const [typesAvionResult, instructorProfileResult, examMineResult, progressionResult, elevesResult, titresCiblesResult] = await Promise.all([
    admin.from('types_avion').select('id, nom, constructeur, code_oaci').order('ordre', { ascending: true }),
    viewer.instructeur_referent_id
      ? admin.from('profiles').select('identifiant').eq('id', viewer.instructeur_referent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('instruction_exam_requests')
      .select('id, requester_id, licence_code, instructeur_id, statut, message, response_note, resultat, dossier_conserve, licence_creee_id, created_at, updated_at, instructeur:profiles!instruction_exam_requests_instructeur_id_fkey(identifiant)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false }),
    viewer.formation_instruction_active && viewer.formation_instruction_licence
      ? admin
          .from('instruction_progression_items')
          .select('licence_code, module_code, completed')
          .eq('eleve_id', user.id)
          .eq('licence_code', viewer.formation_instruction_licence)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    isManager
      ? admin
          .from('profiles')
          .select('id, identifiant, formation_instruction_active, formation_instruction_licence, created_at')
          .eq('instructeur_referent_id', user.id)
          .eq('formation_instruction_active', true)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    titresCiblesPilotesQuery,
  ]);

  if (typesAvionResult.error) errors.push(`Types avion: ${typesAvionResult.error.message}`);
  if (instructorProfileResult.error) errors.push(`Instructeur référent: ${instructorProfileResult.error.message}`);
  if (examMineResult.error) errors.push(`Demandes examen: ${examMineResult.error.message}`);
  if (progressionResult.error) errors.push(`Progression: ${progressionResult.error.message}`);
  if (elevesResult.error) errors.push(`Élèves: ${elevesResult.error.message}`);
  if (titresCiblesResult.error) errors.push(`Cibles titres instruction: ${titresCiblesResult.error.message}`);

  const typesAvion = typesAvionResult.data;
  const meInstructorProfile = instructorProfileResult.data;
  const examMine = examMineResult.data;
  const myProgression = progressionResult?.data;
  const eleves = elevesResult?.data;

  const eleveIds = (eleves || []).map((e) => e.id);
  const [avionsTempResult, elevesProgressionResult] = isManager && eleveIds.length > 0
    ? await Promise.all([
        admin
          .from('inventaire_avions')
          .select('id, proprietaire_id, type_avion_id, nom_personnalise, immatriculation, aeroport_actuel, statut, usure_percent, instruction_actif')
          .eq('instruction_actif', true)
          .eq('instruction_instructeur_id', user.id)
          .in('proprietaire_id', eleveIds)
          .order('created_at', { ascending: false }),
        admin
          .from('instruction_progression_items')
          .select('eleve_id, licence_code, module_code, completed')
          .in('eleve_id', eleveIds),
      ])
    : [{ data: [] as Array<Record<string, unknown>>, error: null }, { data: [] as Array<Record<string, unknown>>, error: null }];

  const examAssignedResult = canViewExaminerInbox
    ? await admin
        .from('instruction_exam_requests')
        .select('id, requester_id, licence_code, instructeur_id, statut, message, response_note, resultat, dossier_conserve, licence_creee_id, created_at, updated_at, requester:profiles!instruction_exam_requests_requester_id_fkey(identifiant)')
        .eq('instructeur_id', user.id)
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>>, error: null };

  let atcTrainingsMine: Array<Record<string, unknown>> = [];
  let atcTrainingsAssigned: Array<Record<string, unknown>> = [];
  const { data: atcMine, error: atcMineErr } = await admin
    .from('instruction_atc_training_requests')
    .select('id, requester_id, assignee_id, message, created_at, updated_at')
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false });
  const { data: atcToMe, error: atcToMeErr } = await admin
    .from('instruction_atc_training_requests')
    .select('id, requester_id, assignee_id, message, created_at, updated_at')
    .eq('assignee_id', user.id)
    .order('created_at', { ascending: false });
  if (atcMineErr) errors.push(`Training ATC: ${atcMineErr.message}`);
  if (atcToMeErr) errors.push(`Training ATC (assigné): ${atcToMeErr.message}`);
  if (!atcMineErr && !atcToMeErr) {
    const aIds = new Set(
      [...(atcMine || []), ...(atcToMe || [])].map((r) => r.assignee_id as string).filter(Boolean),
    );
    const rIds = new Set(
      [...(atcMine || []), ...(atcToMe || [])].map((r) => r.requester_id as string).filter(Boolean),
    );
    const { data: ap } = aIds.size
      ? await admin.from('profiles').select('id, identifiant').in('id', Array.from(aIds))
      : { data: [] };
    const { data: rp } = rIds.size
      ? await admin.from('profiles').select('id, identifiant').in('id', Array.from(rIds))
      : { data: [] };
    const am = new Map((ap || []).map((p) => [p.id, p.identifiant]));
    const rm = new Map((rp || []).map((p) => [p.id, p.identifiant]));
    atcTrainingsMine = (atcMine || []).map((r) => ({ ...r, assignee_identifiant: am.get(r.assignee_id as string) || null }));
    atcTrainingsAssigned = (atcToMe || []).map((r) => ({
      ...r,
      requester_identifiant: rm.get(r.requester_id as string) || null,
    }));
  }

  if (avionsTempResult.error) errors.push(`Avions temp: ${avionsTempResult.error.message}`);
  if (elevesProgressionResult.error) errors.push(`Progression élèves: ${elevesProgressionResult.error.message}`);
  if (examAssignedResult.error) errors.push(`Examens assignés: ${examAssignedResult.error.message}`);

  const avionsTemp = avionsTempResult.data;
  const elevesProgression = elevesProgressionResult.data;
  const examAssigned = examAssignedResult.data;

  const loadError = errors.length > 0 ? errors.join(' · ') : undefined;

  const titresCiblesPilotes = (titresCiblesResult.data || []) as Array<{ id: string; identifiant: string }>;

  return (
    <InstructionClient
      loadError={loadError}
      viewerRole={viewer.role}
      viewerId={viewer.id}
      isManager={isManager}
      canGrantTitreInstructionFlight={canGrantTitreInstructionFlight}
      canGrantTitreInstructionAtc={canGrantTitreInstructionAtc}
      titresCiblesPilotes={titresCiblesPilotes}
      canViewExaminerInbox={canViewExaminerInbox}
      isAtcTrainingInstructor={isAtcTrainingInstructor}
      programs={INSTRUCTION_PROGRAMS}
      createFormationPrograms={createFormationPrograms}
      examLicenceOptions={examLicenceOptions}
      atcTrainingsMine={atcTrainingsMine as Array<Record<string, string | null | undefined>>}
      atcTrainingsAssigned={atcTrainingsAssigned as Array<Record<string, string | null | undefined>>}
      myFormationActive={Boolean(viewer.formation_instruction_active)}
      myFormationLicence={(viewer.formation_instruction_licence as string | null) || null}
      myInstructorIdentifiant={(meInstructorProfile as { identifiant?: string } | null)?.identifiant || null}
      myProgression={(myProgression || []) as Array<{ licence_code: string; module_code: string; completed: boolean }>}
      examRequestsMine={(examMine || []) as Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; resultat: string | null; dossier_conserve: boolean | null; licence_creee_id: string | null; created_at: string; updated_at: string; instructeur: { identifiant: string } | { identifiant: string }[] | null }>}
      examRequestsAssigned={(examAssigned || []) as Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; resultat: string | null; dossier_conserve: boolean | null; licence_creee_id: string | null; created_at: string; updated_at: string; requester: { identifiant: string } | { identifiant: string }[] | null }>}
      eleves={(eleves || []) as Array<{ id: string; identifiant: string; formation_instruction_active: boolean; formation_instruction_licence: string | null; created_at: string }>}
      typesAvion={(typesAvion || []) as Array<{ id: string; nom: string; constructeur: string | null; code_oaci: string | null }>}
      avionsTemp={(avionsTemp || []) as Array<{ id: string; proprietaire_id: string; type_avion_id: string; nom_personnalise: string | null; immatriculation: string | null; aeroport_actuel: string | null; statut: string | null; usure_percent: number | null; instruction_actif: boolean }>}
      elevesProgression={(elevesProgression || []) as Array<{ eleve_id: string; licence_code: string; module_code: string; completed: boolean }>}
    />
  );
}
