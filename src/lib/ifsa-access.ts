import { cookies } from 'next/headers';

export const IFSA_ADMIN_COOKIE = 'ifsa_admin_unlock';

export function hasIfsaAdminUnlockCookie(): boolean {
  return cookies().get(IFSA_ADMIN_COOKIE)?.value === '1';
}

/** Accès espace IFSA : flag ifsa, ou admin ayant saisi le MDP superadmin. */
export function canAccessIfsaSpace(profile: { ifsa?: boolean | null; role?: string | null } | null): boolean {
  if (!profile) return false;
  if (profile.ifsa) return true;
  if (profile.role === 'admin') return hasIfsaAdminUnlockCookie();
  return false;
}

export type IfsaPageGate = 'allow' | 'admin_password' | 'deny';

export function ifsaPageGate(profile: { ifsa?: boolean | null; role?: string | null } | null): IfsaPageGate {
  if (!profile) return 'deny';
  if (profile.ifsa) return 'allow';
  if (profile.role === 'admin') return hasIfsaAdminUnlockCookie() ? 'allow' : 'admin_password';
  return 'deny';
}
