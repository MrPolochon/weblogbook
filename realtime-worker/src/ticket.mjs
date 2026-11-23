const encoder = new TextEncoder();
function decode(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export async function verifyTicket(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 4096) throw new Error('Invalid ticket');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid ticket');
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Invalid ticket');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('HMAC', key, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error('Invalid ticket');
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  const seconds = Math.floor(now / 1000);
  if (claims.aud !== 'weblogbook-radio' || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) ||
      claims.exp <= seconds || claims.iat > seconds + 5 || claims.exp - claims.iat > 90 ||
      !/^[\w-]{1,80}$/.test(claims.sub || '') || !/^[\w-]{16,80}$/.test(claims.jti || '') ||
      !/^(vhf-\d{6}|call-[a-f\d-]{36})$/.test(claims.room || '') ||
      typeof claims.name !== 'string' || claims.name.length > 80) throw new Error('Invalid ticket');
  return claims;
}
export function ticketFromRequest(request) {
  const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(p => p.trim());
  if (!protocols.includes('weblogbook-radio-v1')) throw new Error('Unsupported protocol');
  return protocols.find(p => p.startsWith('ticket.'))?.slice(7);
}
