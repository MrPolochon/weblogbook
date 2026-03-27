import { createHash } from 'crypto';

export const CARTOGRAPHY_ACCESS_COOKIE = 'cartography_editor_access';

export function hashCartographyPassword(password: string) {
  return createHash('sha256').update(`cartography:${password}`).digest('hex');
}

export function hasCartographyEditorAccess(
  cookieValue: string | undefined,
  enabled: boolean | null | undefined,
  passwordHash: string | null | undefined,
) {
  if (!enabled || !passwordHash || !cookieValue) return false;
  return cookieValue === passwordHash;
}
