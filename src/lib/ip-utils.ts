import { NextRequest } from 'next/server';

/**
 * Normalise une adresse IP pour une comparaison cohérente :
 * - Convertit l'IPv6-mappé IPv4 (::ffff:x.x.x.x → x.x.x.x) afin d'éviter
 *   des faux "changements d'IP" quand un proxy renvoie tantôt l'une tantôt l'autre.
 * - Met en minuscules pour les adresses IPv6 pures.
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  const mapped = trimmed.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mapped) return mapped[1];
  return trimmed.toLowerCase();
}

/**
 * Extrait et normalise l'IP cliente depuis les headers HTTP.
 * Fiable uniquement derrière un reverse proxy de confiance (Vercel, Cloudflare, Nginx
 * avec set_real_ip_from configuré). Ces proxies protègent ces headers en production.
 */
export function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return normalizeIp(realIp.trim());
  return null;
}
