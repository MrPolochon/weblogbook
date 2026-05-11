import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'siavi' | 'pilote' | 'controleur' | 'atc' | 'instructeur';
export type Flag = 'armee' | 'ifsa' | 'siavi';

type ProfileRow = {
  id: string;
  role: string | null;
  armee: boolean | null;
  ifsa: boolean | null;
  siavi: boolean | null;
};

/**
 * Recupere le profil + role de l'utilisateur connecte.
 * Memoise par React.cache pour ne faire qu'une requete par render server.
 * Retourne null si non authentifie ou profil introuvable.
 */
export const getProfileWithRole = cache(async (): Promise<ProfileRow | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, armee, ifsa, siavi')
    .eq('id', user.id)
    .single();

  return (profile as ProfileRow | null) ?? null;
});

/**
 * Garantit que l'utilisateur est connecte ET possede l'un des roles requis.
 * Redirige vers /login si non authentifie, /unauthorized si role insuffisant.
 * Retourne le profil pour usage immediat.
 */
export async function requireRole(roles: Role[]): Promise<ProfileRow> {
  const profile = await getProfileWithRole();
  if (!profile) redirect('/login');
  if (!roles.includes(profile.role as Role)) redirect('/unauthorized');
  return profile;
}

/**
 * Garantit que l'utilisateur est connecte ET possede l'un des flags requis
 * (armee, ifsa, siavi). Les admins passent toujours.
 * Redirige vers /login si non authentifie, /unauthorized si aucun flag matche.
 */
export async function requireFlag(flags: Flag[]): Promise<ProfileRow> {
  const profile = await getProfileWithRole();
  if (!profile) redirect('/login');
  const hasFlag = flags.some((f) => Boolean(profile[f]));
  if (!hasFlag && profile.role !== 'admin') redirect('/unauthorized');
  return profile;
}
