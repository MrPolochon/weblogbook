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

  const [profilesRes, volsRes, plansRes, equipageRes, licencesRes, comptesRes, inventaireRes] = await Promise.all([
    admin.from('profiles').select('id, identifiant, heures_initiales_minutes, created_at').not('identifiant', 'is', null),
    admin.from('vols').select('id, pilote_id, copilote_id, instructeur_id, chef_escadron_id, duree_minutes, type_vol, aeroport_depart, aeroport_arrivee, type_avion_id').eq('statut', 'validé'),
    admin.from('plans_vol')
      .select('id, pilote_id, temps_prev_min, type_vol, aeroport_depart, aeroport_arrivee, accepted_at, cloture_at, compagnie_avions:compagnie_avion_id(type_avion_id), inventaire_avions:inventaire_avion_id(type_avion_id)')
      .in('statut', ['cloture', 'en_pause']),
    admin.from('vols_equipage_militaire').select('vol_id, profile_id'),
    admin.from('licences_qualifications').select('user_id'),
    admin.from('felitz_comptes').select('proprietaire_id, solde').eq('type', 'personnel'),
    admin.from('inventaire_avions').select('proprietaire_id'),
  ]);

  const profiles = profilesRes.data || [];
  const volsAnciens = volsRes.data || [];
  const plansClotures = plansRes.data || [];
  const equipageData = equipageRes.data || [];
  const licences = licencesRes.data || [];
  const comptes = comptesRes.data || [];
  const inventaire = inventaireRes.data || [];

  type VolNormalise = { id: string; duree_minutes: number; type_vol: string; aeroport_depart: string; aeroport_arrivee: string; type_avion_id: string | null };

  // Dedup helper: attribute each vol to a user only once
  const volsByUser = new Map<string, VolNormalise[]>();
  const userVolIds = new Map<string, Set<string>>();

  function addVolToUser(userId: string, vol: VolNormalise) {
    if (!userId) return;
    let seen = userVolIds.get(userId);
    if (!seen) { seen = new Set(); userVolIds.set(userId, seen); }
    if (seen.has(vol.id)) return;
    seen.add(vol.id);
    let arr = volsByUser.get(userId);
    if (!arr) { arr = []; volsByUser.set(userId, arr); }
    arr.push(vol);
  }

  // Build equipage map: vol_id → profile_ids
  const equipageByVol = new Map<string, string[]>();
  for (const eq of equipageData) {
    let arr = equipageByVol.get(eq.vol_id);
    if (!arr) { arr = []; equipageByVol.set(eq.vol_id, arr); }
    arr.push(eq.profile_id);
  }

  // Attribute old vols to ALL participants (pilote, copilote, instructeur, chef escadron, équipage mil.)
  for (const v of volsAnciens) {
    const vol: VolNormalise = {
      id: v.id,
      duree_minutes: v.duree_minutes || 0,
      type_vol: v.type_vol,
      aeroport_depart: v.aeroport_depart,
      aeroport_arrivee: v.aeroport_arrivee,
      type_avion_id: v.type_avion_id,
    };
    if (v.pilote_id) addVolToUser(v.pilote_id, vol);
    if (v.copilote_id) addVolToUser(v.copilote_id, vol);
    if (v.instructeur_id) addVolToUser(v.instructeur_id, vol);
    if (v.chef_escadron_id) addVolToUser(v.chef_escadron_id, vol);
    const crew = equipageByVol.get(v.id);
    if (crew) for (const pid of crew) addVolToUser(pid, vol);
  }

  // Attribute plans_vol to pilote only (plans don't have multi-role)
  for (const p of plansClotures) {
    let duree = p.temps_prev_min || 0;
    if (p.accepted_at && p.cloture_at) {
      const real = Math.round((new Date(p.cloture_at).getTime() - new Date(p.accepted_at).getTime()) / 60000);
      if (real > 0) duree = real;
    }
    const ca = p.compagnie_avions as { type_avion_id: string } | { type_avion_id: string }[] | null;
    const ia = p.inventaire_avions as { type_avion_id: string } | { type_avion_id: string }[] | null;
    const typeAvionId =
      (Array.isArray(ca) ? ca[0]?.type_avion_id : ca?.type_avion_id) ||
      (Array.isArray(ia) ? ia[0]?.type_avion_id : ia?.type_avion_id) ||
      null;
    addVolToUser(p.pilote_id, {
      id: `plan_${p.id}`,
      duree_minutes: duree,
      type_vol: p.type_vol,
      aeroport_depart: p.aeroport_depart,
      aeroport_arrivee: p.aeroport_arrivee,
      type_avion_id: typeAvionId,
    });
  }

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
