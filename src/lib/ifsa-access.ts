import { cookies } from 'next/headers';

export const IFSA_ADMIN_COOKIE = 'ifsa_admin_unlock';

export async function hasIfsaAdminUnlockCookie(): Promise<boolean> {
  return (await cookies()).get(IFSA_ADMIN_COOKIE)?.value === '1';
}

/**
 * Accès espace IFSA :
 * - ifsa === true → accès direct (y compris admin + flag IFSA)
 * - admin sans ifsa → mot de passe + code superadmin (cookie ifsa_admin_unlock)
 * - tout le reste → refusé
 */
export async function canAccessIfsaSpace(profile: { ifsa?: boolean | null; role?: string | null } | null): Promise<boolean> {
  if (!profile) return false;
  if (profile.ifsa) return true;
  if (profile.role === 'admin') return hasIfsaAdminUnlockCookie();
  return false;
}

export type IfsaPageGate = 'allow' | 'admin_password' | 'deny';

export async function ifsaPageGate(profile: { ifsa?: boolean | null; role?: string | null } | null): Promise<IfsaPageGate> {
  if (!profile) return 'deny';
  if (profile.ifsa) return 'allow';
  if (profile.role === 'admin') return (await hasIfsaAdminUnlockCookie()) ? 'allow' : 'admin_password';
  return 'deny';
}
