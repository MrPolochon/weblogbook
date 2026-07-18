export const LIB_ESCADRILLE: Record<string, string> = {
  escadrille: 'Escadrille',
  escadron: 'Escadron',
  autre: 'Autre',
};

export const LIB_ESC_FORM: Record<string, string> = {
  escadrille: 'Vol en escadrille',
  escadron: 'Vol en escadron (vous = chef d\'escadron)',
  autre: 'Ni l\'un ni l\'autre (précisez la nature)',
};

export const LIB_NATURE_VOL: Record<string, string> = {
  entrainement: 'Entraînement',
  escorte: 'Escorte',
  sauvetage: 'Sauvetage',
  reconnaissance: 'Reconnaissance',
  autre: 'Autre',
};

export const LIB_DIFFICULTE: Record<string, string> = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
  expert: 'Expert',
};

export const LIB_AAR_TAG: Record<string, string> = {
  objectif_atteint: 'Objectif atteint',
  dommages: 'Dommages subis',
  incident: 'Incident signalé',
  extraction_reussie: 'Extraction réussie',
  retard_meteo: 'Retard météo',
  contact_ennemi: 'Contact ennemi',
  sans_incident: 'Sans incident',
};

export const LIB_STATUT: Record<string, { label: string; color: string; bg: string }> = {
  validé: { label: 'Validé', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-500/20' },
  refusé: { label: 'Refusé', color: 'text-red-400', bg: 'bg-red-400/10 border-red-500/20' },
  en_attente: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-500/20' },
};

export function libNatureVol(nature: string | null | undefined, autre?: string | null): string {
  if (!nature) return '—';
  if (nature === 'autre') return autre?.trim() || 'Autre';
  return LIB_NATURE_VOL[nature] || nature;
}

export function libEscadrille(v: string | null | undefined): string {
  if (!v) return '—';
  return LIB_ESCADRILLE[v] || v;
}

export function roleUtilisateurSurVol(
  vol: {
    pilote_id: string | null;
    copilote_id: string | null;
    chef_escadron_id: string | null;
    equipage?: { profile_id: string }[] | null;
  },
  userId: string,
): string {
  if (vol.chef_escadron_id === userId) return 'Chef d\'escadron';
  if (vol.copilote_id === userId) return 'Co-pilote';
  if (vol.pilote_id === userId) return 'Pilote';
  const eq = Array.isArray(vol.equipage) ? vol.equipage : [];
  if (eq.some((e) => e.profile_id === userId)) return 'Membre';
  return 'Pilote';
}
