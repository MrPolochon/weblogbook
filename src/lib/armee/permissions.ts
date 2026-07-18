import { createAdminClient } from '@/lib/supabase/admin';

export type ArmeeProfile = {
  id: string;
  role: string | null;
  armee: boolean | null;
  blocked_until?: string | null;
};

/**
 * Modèle de rôles — espace militaire
 *
 * | Acteur            | Identifiant                         | Pouvoirs |
 * |-------------------|-------------------------------------|----------|
 * | Pilote militaire  | profiles.armee = true               | Accès hub, déposer vols/missions, AAR, stats perso |
 * | PDG militaire     | felitz_comptes(type=militaire).proprietaire_id | + compte Felitz Armée, briefing ops, valider/refuser vols militaires |
 * | Admin site        | profiles.role = 'admin'             | Tout le site + nomination du PDG + config compte |
 *
 * Le PDG n'est PAS un admin site : pas d'accès /admin hors périmètre armée,
 * pas de nomination d'un autre PDG, pas de gestion des profils globaux.
 */

export const PDG_MILITAIRE_ROLE = {
  label: 'PDG militaire',
  shortLabel: 'PDG Armée',
  description:
    'Commandant opérationnel de l\'espace militaire : gère le briefing, valide les vols militaires et le compte Felitz Armée. Ce n\'est pas un administrateur du site.',
  powers: [
    'Accéder et gérer le compte Felitz Armée',
    'Publier / modifier le briefing opérationnel',
    'Valider ou refuser les vols militaires (et déclencher les récompenses de mission)',
    'Tout ce qu\'un pilote militaire peut faire',
  ] as const,
  notPowers: [
    'Administrer le site (/admin global)',
    'Nommer ou révoquer un autre PDG (réservé aux admins)',
    'Modifier les profils ou rôles des utilisateurs',
  ] as const,
};

export function isAdmin(profile: Pick<ArmeeProfile, 'role'> | null | undefined): boolean {
  return profile?.role === 'admin';
}

export function canAccessEspaceMilitaire(profile: Pick<ArmeeProfile, 'role' | 'armee'> | null | undefined): boolean {
  return Boolean(profile?.armee) || isAdmin(profile);
}

export function isBlocked(profile: Pick<ArmeeProfile, 'blocked_until'> | null | undefined): boolean {
  return Boolean(profile?.blocked_until && new Date(profile.blocked_until) > new Date());
}

export function canSubmitVolMilitaire(profile: ArmeeProfile | null | undefined): boolean {
  return canAccessEspaceMilitaire(profile) && !isBlocked(profile);
}

export function canEditVolMilitaire(
  vol: { pilote_id: string | null; copilote_id: string | null; chef_escadron_id: string | null; statut: string },
  userId: string,
  isAdminUser: boolean,
): boolean {
  if (vol.statut !== 'en_attente' && !isAdminUser) return false;
  return (
    isAdminUser ||
    vol.pilote_id === userId ||
    vol.copilote_id === userId ||
    vol.chef_escadron_id === userId
  );
}

export function canDeleteVolMilitaire(
  vol: { pilote_id: string | null; copilote_id: string | null; chef_escadron_id: string | null },
  userId: string,
  isAdminUser: boolean,
): boolean {
  return (
    isAdminUser ||
    vol.pilote_id === userId ||
    vol.copilote_id === userId ||
    vol.chef_escadron_id === userId
  );
}

/** PDG = propriétaire du compte Felitz type `militaire`. */
export async function isPdgMilitaire(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('felitz_comptes')
    .select('proprietaire_id')
    .eq('type', 'militaire')
    .maybeSingle();
  return data?.proprietaire_id === userId;
}

export async function getPdgMilitaireUserId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('felitz_comptes')
    .select('proprietaire_id')
    .eq('type', 'militaire')
    .maybeSingle();
  return data?.proprietaire_id ?? null;
}

/** Compte Felitz Armée : PDG ou admin site. */
export async function canAccessCompteMilitaire(userId: string, profile?: Pick<ArmeeProfile, 'role'> | null): Promise<boolean> {
  if (isAdmin(profile)) return true;
  return isPdgMilitaire(userId);
}

/** Briefing opérationnel : PDG ou admin site. */
export async function canManageBriefing(userId: string, profile?: Pick<ArmeeProfile, 'role'> | null): Promise<boolean> {
  if (isAdmin(profile)) return true;
  return isPdgMilitaire(userId);
}

/**
 * Validation / refus d'un vol militaire (récompenses mission incluses).
 * PDG opérationnel ou admin site — pas les pilotes ordinaires.
 */
export async function canValidateVolMilitaire(
  userId: string,
  profile?: Pick<ArmeeProfile, 'role'> | null,
): Promise<boolean> {
  if (isAdmin(profile)) return true;
  return isPdgMilitaire(userId);
}

/** Nomination du PDG : admin site uniquement. */
export function canNominatePdgMilitaire(profile: Pick<ArmeeProfile, 'role'> | null | undefined): boolean {
  return isAdmin(profile);
}
