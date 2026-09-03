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
  const { data: rows, error } = await admin.rpc('get_classement_pilotes');
  if (error) {
    console.error('get_classement_pilotes', error);
  }

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
    nbAvions: Number(p.nb_avions) || 0,
    memberSince: p.member_since,
    photoUrl: photosByUser.get(p.id) ?? null,
  }));

  return <ClassementClient pilotes={pilotes} currentUserId={user.id} />;
}
