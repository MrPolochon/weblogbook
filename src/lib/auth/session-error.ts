/** Erreurs Auth où le refresh cookie est déjà consommé / révoqué. */
export function isStaleRefreshToken(error: { code?: string; message?: string } | null | undefined): boolean {
  const code = error?.code || '';
  const msg = error?.message || '';
  return (
    code === 'refresh_token_not_found' ||
    code === 'refresh_token_already_used' ||
    /invalid refresh token/i.test(msg)
  );
}
