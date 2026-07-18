import type { ArmeeMission } from './types';

export const ARME_MISSIONS: ArmeeMission[] = [
  {
    id: 'patrouille-frontiere',
    titre: 'Patrouille de frontière',
    description: 'Surveillance d\'une zone sensible. Vol court, risque modéré.',
    rewardMin: 15000,
    rewardMax: 35000,
    cooldownMinutes: 60,
    aeroport_depart: 'IMLR',
    aeroport_arrivee: 'IRFD',
    duree_minutes: 35,
    escadrille_ou_escadron: 'escadrille',
    nature_vol_militaire: 'reconnaissance',
    callsign_prefix: 'ARM-PAT',
    difficulty: 'facile',
    minGrade: 'recrue',
  },
  {
    id: 'escorte-convoi',
    titre: 'Escorte de convoi',
    description: 'Protection d\'un convoi stratégique sur un trajet moyen.',
    rewardMin: 25000,
    rewardMax: 60000,
    cooldownMinutes: 60,
    aeroport_depart: 'IRFD',
    aeroport_arrivee: 'ILAR',
    duree_minutes: 55,
    escadrille_ou_escadron: 'escadron',
    nature_vol_militaire: 'escorte',
    callsign_prefix: 'ARM-ESC',
    difficulty: 'moyen',
    minGrade: 'soldat',
  },
  {
    id: 'reconnaissance',
    titre: 'Reconnaissance aérienne',
    description: 'Collecte de renseignements. Vol long et exigeant.',
    rewardMin: 30000,
    rewardMax: 80000,
    cooldownMinutes: 60,
    aeroport_depart: 'IMLR',
    aeroport_arrivee: 'ILAR',
    duree_minutes: 75,
    escadrille_ou_escadron: 'escadrille',
    nature_vol_militaire: 'reconnaissance',
    callsign_prefix: 'ARM-REC',
    difficulty: 'difficile',
    minGrade: 'caporal',
  },
  {
    id: 'sauvetage',
    titre: 'Mission de sauvetage',
    description: 'Extraction d\'équipage en détresse. Priorité élevée.',
    rewardMin: 40000,
    rewardMax: 120000,
    cooldownMinutes: 90,
    aeroport_depart: 'ILAR',
    aeroport_arrivee: 'IRFD',
    duree_minutes: 65,
    escadrille_ou_escadron: 'escadrille',
    nature_vol_militaire: 'sauvetage',
    callsign_prefix: 'ARM-SAR',
    difficulty: 'expert',
    minGrade: 'sergent',
  },
];

export function getMissionById(id: string | null | undefined): ArmeeMission | null {
  if (!id) return null;
  return ARME_MISSIONS.find((m) => m.id === id) || null;
}

export function rollMissionRewardBase(mission: ArmeeMission): number {
  return Math.floor(Math.random() * (mission.rewardMax - mission.rewardMin + 1)) + mission.rewardMin;
}

export function generateMissionCallsign(mission: ArmeeMission): string {
  return `${mission.callsign_prefix}${Math.floor(100 + Math.random() * 900)}`;
}

/**
 * Vérifie que le plan (aéroports, durée, type, nature) correspond exactement à la mission.
 */
export function missionPlanMatches(
  mission: ArmeeMission,
  plan: {
    aeroport_depart: string;
    aeroport_arrivee: string;
    duree_minutes: number;
    escadrille_ou_escadron: string;
    nature_vol_militaire: string;
  },
): boolean {
  return (
    plan.aeroport_depart.toUpperCase() === mission.aeroport_depart &&
    plan.aeroport_arrivee.toUpperCase() === mission.aeroport_arrivee &&
    plan.duree_minutes === mission.duree_minutes &&
    plan.escadrille_ou_escadron === mission.escadrille_ou_escadron &&
    plan.nature_vol_militaire === mission.nature_vol_militaire
  );
}
