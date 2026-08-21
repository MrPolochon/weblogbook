import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { discordFetch, discordGetMe } from '@/lib/support/discord-api';

/** SPKI prefix for a raw 32-byte Ed25519 public key */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

let cachedApplicationId: string | null = null;

/** Discord Ed25519 public key: 32 bytes = 64 hex chars. Never a bot token. */
export function getDiscordPublicKey(): string | null {
  const fromEnv = (process.env.DISCORD_PUBLIC_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(fromEnv)) return null;
  return fromEnv;
}

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string
): boolean {
  try {
    const keyBytes = Buffer.from(publicKeyHex.trim(), 'hex');
    const sigBytes = Buffer.from(signatureHex.trim(), 'hex');
    if (keyBytes.length !== 32 || sigBytes.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, keyBytes]),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(null, Buffer.from(timestamp + rawBody), key, sigBytes);
  } catch {
    return false;
  }
}

export async function getDiscordApplicationId(fallback?: string): Promise<string> {
  if (fallback && String(fallback).trim()) return String(fallback);
  if (cachedApplicationId) return cachedApplicationId;
  try {
    const me = await discordGetMe();
    const id = String(me.id || '').trim();
    if (id) {
      cachedApplicationId = id;
      return id;
    }
  } catch (e) {
    console.error('[support-interactions] GET /users/@me a échoué', e);
  }
  try {
    const app = await discordFetch('/oauth2/applications/@me');
    const id = String(app.id || '').trim();
    if (id) {
      cachedApplicationId = id;
      return id;
    }
  } catch { /* ignore */ }
  return '';
}

const DISCORD_API = 'https://discord.com/api/v10';

export async function discordEditOriginalInteraction(
  applicationId: string,
  interactionToken: string,
  payload: Record<string, unknown>
) {
  const url = `${DISCORD_API}/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  const body = JSON.stringify(payload);
  const bot = process.env.SUPPORT_BOT_TOKEN || process.env.DISCORD_SUPPORT_BOT_TOKEN || '';
  const jsonHeaders = { 'Content-Type': 'application/json' };
  let res = await fetch(url, {
    method: 'PATCH',
    headers: bot ? { ...jsonHeaders, Authorization: `Bot ${bot}` } : jsonHeaders,
    body,
  });
  if ((res.status === 401 || res.status === 403) && bot) {
    res = await fetch(url, { method: 'PATCH', headers: jsonHeaders, body });
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Interaction follow-up HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
}
