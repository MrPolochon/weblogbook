export type VolMilitaireStatut = 'en_attente' | 'validé' | 'refusé';

export type VolMilitaireRow = {
  id: string;
  pilote_id: string | null;
  copilote_id: string | null;
  chef_escadron_id: string | null;
  duree_minutes: number | null;
  depart_utc: string;
  arrivee_utc: string | null;
  statut: VolMilitaireStatut;
  type_avion_militaire: string | null;
  role_pilote: string | null;
  callsign: string | null;
  escadrille_ou_escadron: string | null;
  nature_vol_militaire: string | null;
  nature_vol_militaire_autre: string | null;
  aeroport_depart: string | null;
  aeroport_arrivee: string | null;
  mission_id: string | null;
  mission_status: string | null;
  mission_reward_final: number | null;
  pilote: { identifiant: string } | { identifiant: string }[] | null;
  copilote: { identifiant: string } | { identifiant: string }[] | null;
  equipage: { profile_id: string }[] | null;
};

export type MilitaireTabId = 'vue' | 'missions' | 'carnet';

export type MilitaireStats = {
  totalMinutesValides: number;
  volsEnAttente: number;
  volsValides: number;
  volsRefuses: number;
  flotteActive: number;
};
