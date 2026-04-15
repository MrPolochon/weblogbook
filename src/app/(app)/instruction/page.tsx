import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import InstructionClient from './InstructionClient';
import { INSTRUCTION_PROGRAMS } from '@/lib/instruction-programs';
import { ALL_LICENCE_TYPES } from '@/lib/licence-types';

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

  const isManager = viewer.role === 'instructeur' || viewer.role === 'admin';

  // Batch all independent queries together
  const [typesAvionResult, instructorProfileResult, examMineResult, progressionResult, elevesResult] = await Promise.all([
    admin.from('types_avion').select('id, nom, constructeur, code_oaci').order('ordre', { ascending: true }),
    viewer.instructeur_referent_id
      ? admin.from('profiles').select('identifiant').eq('id', viewer.instructeur_referent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('instruction_exam_requests')
      .select('id, requester_id, licence_code, instructeur_id, statut, message, response_note, created_at, updated_at, instructeur:profiles!instruction_exam_requests_instructeur_id_fkey(identifiant)')
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
  ]);

  if (typesAvionResult.error) errors.push(`Types avion: ${typesAvionResult.error.message}`);
  if (instructorProfileResult.error) errors.push(`Instructeur référent: ${instructorProfileResult.error.message}`);
  if (examMineResult.error) errors.push(`Demandes examen: ${examMineResult.error.message}`);
  if (progressionResult.error) errors.push(`Progression: ${progressionResult.error.message}`);
  if (elevesResult.error) errors.push(`Élèves: ${elevesResult.error.message}`);

  const typesAvion = typesAvionResult.data;
  const meInstructorProfile = instructorProfileResult.data;
  const examMine = examMineResult.data;
  const myProgression = progressionResult?.data;
  const eleves = elevesResult?.data;

  const eleveIds = (eleves || []).map((e) => e.id);
  const [avionsTempResult, elevesProgressionResult, examAssignedResult] = isManager && eleveIds.length > 0
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
        admin
          .from('instruction_exam_requests')
          .select('id, requester_id, licence_code, instructeur_id, statut, message, response_note, created_at, updated_at, requester:profiles!instruction_exam_requests_requester_id_fkey(identifiant)')
          .eq('instructeur_id', user.id)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: [] as Array<Record<string, unknown>>, error: null }, { data: [] as Array<Record<string, unknown>>, error: null }, { data: [] as Array<Record<string, unknown>>, error: null }];

  if (avionsTempResult.error) errors.push(`Avions temp: ${avionsTempResult.error.message}`);
  if (elevesProgressionResult.error) errors.push(`Progression élèves: ${elevesProgressionResult.error.message}`);
  if (examAssignedResult.error) errors.push(`Examens assignés: ${examAssignedResult.error.message}`);

  const avionsTemp = avionsTempResult.data;
  const elevesProgression = elevesProgressionResult.data;
  const examAssigned = examAssignedResult.data;

  const loadError = errors.length > 0 ? errors.join(' · ') : undefined;

  return (
    <InstructionClient
      loadError={loadError}
      viewerRole={viewer.role}
      viewerId={viewer.id}
      programs={INSTRUCTION_PROGRAMS}
      examLicenceOptions={[...ALL_LICENCE_TYPES]}
      myFormationActive={Boolean(viewer.formation_instruction_active)}
      myFormationLicence={(viewer.formation_instruction_licence as string | null) || null}
      myInstructorIdentifiant={(meInstructorProfile as { identifiant?: string } | null)?.identifiant || null}
      myProgression={(myProgression || []) as Array<{ licence_code: string; module_code: string; completed: boolean }>}
      examRequestsMine={(examMine || []) as Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; created_at: string; updated_at: string; instructeur: { identifiant: string } | { identifiant: string }[] | null }>}
      examRequestsAssigned={(examAssigned || []) as Array<{ id: string; requester_id: string; licence_code: string; instructeur_id: string | null; statut: string; message: string | null; response_note: string | null; created_at: string; updated_at: string; requester: { identifiant: string } | { identifiant: string }[] | null }>}
      eleves={(eleves || []) as Array<{ id: string; identifiant: string; formation_instruction_active: boolean; formation_instruction_licence: string | null; created_at: string }>}
      typesAvion={(typesAvion || []) as Array<{ id: string; nom: string; constructeur: string | null; code_oaci: string | null }>}
      avionsTemp={(avionsTemp || []) as Array<{ id: string; proprietaire_id: string; type_avion_id: string; nom_personnalise: string | null; immatriculation: string | null; aeroport_actuel: string | null; statut: string | null; usure_percent: number | null; instruction_actif: boolean }>}
      elevesProgression={(elevesProgression || []) as Array<{ eleve_id: string; licence_code: string; module_code: string; completed: boolean }>}
    />
  );
}
