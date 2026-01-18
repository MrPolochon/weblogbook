export const EMAIL_DOMAIN = 'logbook.local';

export function identifiantToEmail(identifiant: string): string {
  return `${String(identifiant).trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}
