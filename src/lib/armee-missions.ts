export type ArmeeMission = {
  id: string;
  titre: string;
  description: string;
  rewardMin: number;
  rewardMax: number;
  cooldownMinutes: number;
};

export const ARME_MISSIONS: ArmeeMission[] = [
  {
    id: 'patrouille-frontiere',
    titre: 'Patrouille de frontière',
    description: 'Surveillance d\'une zone sensible. Vol court, risque modéré.',
    rewardMin: 15000,
    rewardMax: 35000,
    cooldownMinutes: 60
  },
  {
    id: 'escorte-convoi',
    titre: 'Escorte de convoi',
    description: 'Protection d\'un convoi stratégique sur un trajet moyen.',
    rewardMin: 25000,
    rewardMax: 60000,
    cooldownMinutes: 60
  },
  {
    id: 'reconnaissance',
    titre: 'Reconnaissance aérienne',
    description: 'Collecte de renseignements. Vol long et exigeant.',
    rewardMin: 30000,
    rewardMax: 80000,
    cooldownMinutes: 60
  },
  {
    id: 'sauvetage',
    titre: 'Mission de sauvetage',
    description: 'Extraction d\'équipage en détresse. Priorité élevée.',
    rewardMin: 40000,
    rewardMax: 120000,
    cooldownMinutes: 90
  }
];
