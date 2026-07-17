import crypto from 'crypto';

const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 h

function secret(): string {
  return (
    process.env.AEROSCHOOL_TEST_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ||
    'aeroschool-dev-secret'
  );
}

/** Jeton signé émis au démarrage du test (anti-soumission directe sans session). */
export function createAeroSchoolTestToken(formId: string, userId: string | null): string {
  const nonce = crypto.randomBytes(8).toString('hex');
  const ts = String(Date.now());
  const payload = `${formId}:${userId || 'anon'}:${ts}:${nonce}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyAeroSchoolTestToken(token: string, formId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon <= 0) return false;
    const sig = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const parts = payload.split(':');
    if (parts.length !== 4) return false;
    const [fid, , ts] = parts;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 16);
    if (sig !== expected || fid !== formId) return false;
    const age = Date.now() - parseInt(ts, 10);
    if (Number.isNaN(age) || age < 0 || age > MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}
