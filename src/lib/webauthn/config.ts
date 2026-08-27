import type { NextRequest } from 'next/server';

export const MONTHLY_EMAIL_VERIFICATION_DAYS = 30;

const PRODUCTION_FALLBACK_ORIGIN = 'https://logbook.ptfs.fr';

/** Origine publique du site (HTTPS en production). */
export function getWebAuthnOrigin(req?: NextRequest): string {
  if (req?.nextUrl?.origin) {
    const origin = req.nextUrl.origin;
    if (origin.startsWith('http://localhost') || origin.startsWith('https://')) {
      return origin;
    }
  }
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '');
  }
  return PRODUCTION_FALLBACK_ORIGIN;
}

/** rpID WebAuthn dérivé de l'origine (domaine sans port). */
export function getWebAuthnRpId(req?: NextRequest): string {
  const origin = getWebAuthnOrigin(req);
  try {
    return new URL(origin).hostname;
  } catch {
    return 'localhost';
  }
}

export function getWebAuthnRpName(): string {
  return 'PTFS Logbook';
}

/** Téléphone : biométrie locale. PC : Windows Hello ou QR, sans imposer cross-platform
 * (sinon Windows répond NotAllowedError s'il n'y a pas de clé USB). */
export function isMobileWebAuthnClient(req?: NextRequest): boolean {
  const ua = req?.headers.get('user-agent') || '';
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

export function webauthnCeremonyHints(req?: NextRequest): {
  hints: Array<'client-device' | 'hybrid'>;
  authenticatorAttachment?: 'platform' | 'cross-platform';
  transports: Array<'internal' | 'hybrid'>;
} {
  if (isMobileWebAuthnClient(req)) {
    return {
      hints: ['client-device'],
      authenticatorAttachment: 'platform',
      transports: ['internal', 'hybrid'],
    };
  }
  return {
    hints: ['hybrid', 'client-device'],
    transports: ['hybrid', 'internal'],
  };
}


export function needsMonthlyEmailVerification(lastEmailVerificationAt: string | null | undefined): boolean {
  if (!lastEmailVerificationAt) return true;
  const last = new Date(lastEmailVerificationAt);
  if (Number.isNaN(last.getTime())) return true;
  const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > MONTHLY_EMAIL_VERIFICATION_DAYS;
}

export function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBuffer(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Node.js : encode Buffer/Uint8Array en base64url. */
export function nodeBufferToBase64url(data: Uint8Array | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Node.js : decode base64url en Buffer. */
export function nodeBase64urlToBuffer(base64url: string): Buffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  return Buffer.from(base64 + pad, 'base64');
}
