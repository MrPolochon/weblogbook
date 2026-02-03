export type ArmeeMission = {
  id: string;
  titre: string;
  description: string;
  rewardMin: number;
  rewardMax: number;
  cooldownMinutes: number;
  aeroport_depart: string;
  aeroport_arrivee: string;
  duree_minutes: number;
  escadrille_ou_escadron: 'escadrille' | 'escadron' | 'autre';
  nature_vol_militaire: 'entrainement' | 'escorte' | 'sauvetage' | 'reconnaissance' | 'autre';
  callsign_prefix: string;
};

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
    callsign_prefix: 'ARM-PAT'
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
    callsign_prefix: 'ARM-ESC'
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
    callsign_prefix: 'ARM-REC'
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
    callsign_prefix: 'ARM-SAR'
  }
];
