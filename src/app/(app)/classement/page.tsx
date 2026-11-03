import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { getUserPhotosMap } from '@/lib/user-photos';
import ClassementClient from './ClassementClient';

type PiloteStat = {
  id: string;
  identifiant: string;
  totalMinutes: number;
  nbVols: number;
  nbLicences: number;
  nbAeroports: number;
  nbTypesAvion: number;
  nbVolsIFR: number;
  nbVolsVFR: number;
  nbVolsInstruction: number;
  nbVolsMilitaires: number;
  longestFlight: number;
  solde: number;
  nbAvions: number;
  nbBadges: number;
  memberSince: string;
  photoUrl: string | null;
};

type ClassementRow = {
  id: string;
  identifiant: string;
  total_minutes: number | string;
  nb_vols: number | string;
  nb_licences: number | string;
  nb_aeroports: number | string;
  nb_types_avion: number | string;
  nb_vols_ifr: number | string;
  nb_vols_vfr: number | string;
  nb_vols_instruction: number | string;
  nb_vols_militaires: number | string;
  longest_flight: number | string;
  solde: number | string;
  nb_avions: number | string;
  member_since: string;
};

export default async function ClassementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const [{ data: rows, error }, { data: research, error: researchError }] = await Promise.all([
    admin.rpc('get_classement_pilotes'),
    admin.rpc('get_classement_recherches'),
  ]);
  if (researchError) console.error('get_classement_recherches', researchError);
  let companies = (research ?? []) as { nom: string; recherches: number }[];
  let unavailable = Boolean(researchError);
  if (researchError) {
    const { data, error } = await admin.from('company_research_projects')
      .select('company_id, compagnies!inner(nom)').lte('ready_at', new Date().toISOString()).limit(1000);
    if (!error && data && data.length < 1000) {
      const counts = new Map<string, { nom: string; recherches: number }>();
      for (const row of data as unknown as { company_id: string; compagnies: { nom: string } }[]) {
        const previous = counts.get(row.company_id);
        counts.set(row.company_id, { nom: row.compagnies.nom, recherches: (previous?.recherches ?? 0) + 1 });
      }
      companies = [...counts.values()].sort((a, b) => b.recherches - a.recherches || a.nom.localeCompare(b.nom));
      unavailable = false;
    }
  }

  if (error) {
    console.error('get_classement_pilotes', error);
  }

  const { data: badgeCounts } = await admin.rpc("get_badge_counts");
  const badgesByUser = new Map<string, number>((badgeCounts ?? []).map((row: { user_id: string; total: number }): [string, number] => [row.user_id, Number(row.total)]));
  const raw = (rows ?? []) as ClassementRow[];
  const photosByUser = await getUserPhotosMap(admin, raw.map((p) => p.id));

  const pilotes: PiloteStat[] = raw.map((p) => ({
    id: p.id,
    identifiant: p.identifiant,
    totalMinutes: Number(p.total_minutes) || 0,
    nbVols: Number(p.nb_vols) || 0,
    nbLicences: Number(p.nb_licences) || 0,
    nbAeroports: Number(p.nb_aeroports) || 0,
    nbTypesAvion: Number(p.nb_types_avion) || 0,
    nbVolsIFR: Number(p.nb_vols_ifr) || 0,
    nbVolsVFR: Number(p.nb_vols_vfr) || 0,
    nbVolsInstruction: Number(p.nb_vols_instruction) || 0,
    nbVolsMilitaires: Number(p.nb_vols_militaires) || 0,
    longestFlight: Number(p.longest_flight) || 0,
    solde: Number(p.solde) || 0,
    nbBadges: badgesByUser.get(p.id) ?? 0,
    nbAvions: Number(p.nb_avions) || 0,
    memberSince: p.member_since,
    photoUrl: photosByUser.get(p.id) ?? null,
  }));

  const { data: logos } = await admin.from('compagnies').select('id, nom, logo_url');
  const companiesByName = new Map<string, { id: string; logo_url: string | null }>(
    ((logos ?? []) as { id: string; nom: string; logo_url: string | null }[]).map(company => [company.nom, company])
  );
  const researchEntries = companies.map((company, index) => ({
    id: companiesByName.get(company.nom)?.id ?? String(index),
    identifiant: company.nom,
    photoUrl: companiesByName.get(company.nom)?.logo_url ?? null,
    recherches: company.recherches,
  }));
  return <ClassementClient pilotes={pilotes} currentUserId={user.id} researchEntries={researchEntries} researchUnavailable={unavailable} />;
}
