import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
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
};

export default async function ClassementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const [profilesRes, volsRes, licencesRes, comptesRes, inventaireRes] = await Promise.all([
    admin.from('profiles').select('id, identifiant, heures_initiales_minutes, created_at').not('identifiant', 'is', null),
    admin.from('vols').select('pilote_id, duree_minutes, type_vol, aeroport_depart, aeroport_arrivee, type_avion_id').eq('statut', 'validé'),
    admin.from('licences_qualifications').select('user_id'),
    admin.from('felitz_comptes').select('proprietaire_id, solde').eq('type', 'personnel'),
    admin.from('inventaire_avions').select('proprietaire_id'),
  ]);

  const profiles = profilesRes.data || [];
  const vols = volsRes.data || [];
  const licences = licencesRes.data || [];
  const comptes = comptesRes.data || [];
  const inventaire = inventaireRes.data || [];

  const licencesByUser = new Map<string, number>();
  for (const l of licences) {
    licencesByUser.set(l.user_id, (licencesByUser.get(l.user_id) || 0) + 1);
  }

  const soldeByUser = new Map<string, number>();
  for (const c of comptes) {
    if (c.proprietaire_id) soldeByUser.set(c.proprietaire_id, c.solde || 0);
  }

  const avionsByUser = new Map<string, number>();
  for (const a of inventaire) {
    avionsByUser.set(a.proprietaire_id, (avionsByUser.get(a.proprietaire_id) || 0) + 1);
  }

  const volsByUser = new Map<string, typeof vols>();
  for (const v of vols) {
    const arr = volsByUser.get(v.pilote_id) || [];
    arr.push(v);
    volsByUser.set(v.pilote_id, arr);
  }

  const pilotes: PiloteStat[] = profiles.map(p => {
    const userVols = volsByUser.get(p.id) || [];
    const totalMinutes = (p.heures_initiales_minutes || 0) + userVols.reduce((s, v) => s + (v.duree_minutes || 0), 0);
    const aeroports = new Set<string>();
    const typesAvion = new Set<string>();
    let longest = 0;
    let ifr = 0, vfr = 0, instr = 0, mil = 0;
    for (const v of userVols) {
      if (v.aeroport_depart) aeroports.add(v.aeroport_depart);
      if (v.aeroport_arrivee) aeroports.add(v.aeroport_arrivee);
      if (v.type_avion_id) typesAvion.add(v.type_avion_id);
      if (v.duree_minutes > longest) longest = v.duree_minutes;
      if (v.type_vol === 'IFR') ifr++;
      else if (v.type_vol === 'VFR') vfr++;
      if (v.type_vol === 'Instruction') instr++;
      if (v.type_vol === 'Vol militaire') mil++;
    }
    return {
      id: p.id,
      identifiant: p.identifiant,
      totalMinutes,
      nbVols: userVols.length,
      nbLicences: licencesByUser.get(p.id) || 0,
      nbAeroports: aeroports.size,
      nbTypesAvion: typesAvion.size,
      nbVolsIFR: ifr,
      nbVolsVFR: vfr,
      nbVolsInstruction: instr,
      nbVolsMilitaires: mil,
      longestFlight: longest,
      solde: soldeByUser.get(p.id) || 0,
      nbAvions: avionsByUser.get(p.id) || 0,
      memberSince: p.created_at,
    };
  });

  return <ClassementClient pilotes={pilotes} currentUserId={user.id} />;
}
