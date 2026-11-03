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
  const companies = (research ?? []) as { nom: string; recherches: number }[];
  let rank = 0;
  if (error) {
    console.error('get_classement_pilotes', error);
  }

  const { data: badgeCounts } = await admin.rpc("get_badge_counts");
  const badgesByUser = new Map((badgeCounts ?? []).map((row: { user_id: string; total: number }) => [row.user_id, Number(row.total)]));
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

  return (
    <>
      <section aria-labelledby="classement-recherches" className="card mx-auto my-6 max-w-6xl p-5">
        <h2 id="classement-recherches" className="text-lg font-semibold">Recherche technologique des compagnies</h2>
        <p className="mb-4 text-sm opacity-75">Classement par nombre de recherches débloquées.</p>
        {researchError ? <p>Classement temporairement indisponible.</p> : companies.length === 0 ? (
          <p>Aucune recherche débloquée pour le moment.</p>
        ) : (
          <ol className="divide-y divide-slate-500/25">
            {companies.map((company, index) => {
              if (company.recherches !== companies[index - 1]?.recherches) rank = index + 1;
              return (
                <li key={index} className="flex items-center gap-3 py-2">
                  <span className="w-8 tabular-nums">#{rank}</span>
                  <span className="flex-1 font-medium">{company.nom}</span>
                  <span className="tabular-nums">{company.recherches}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <ClassementClient pilotes={pilotes} currentUserId={user.id} />
    </>
  );
}
