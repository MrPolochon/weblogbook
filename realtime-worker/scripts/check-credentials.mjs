import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = 'https://rtc.live.cloudflare.com/v1';
const publicCodes = new Set(['unauthorized', 'not_found', 'decoding_error', 'invalid_params',
  'payload_too_large', 'internal_error', 'backend_error', 'temporarily_unavailable_error']);

function networkReason(error) {
  const code = error?.cause?.code || error?.code;
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS : impossible de trouver rtc.live.cloudflare.com.';
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(code)) {
    return 'TLS : certificat non valide. Verifier la date du PC et les reglages du proxy/antivirus.';
  }
  if (['TimeoutError', 'AbortError'].includes(error?.name) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) {
    return 'Reseau : delai de connexion depasse.';
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) {
    return 'Reseau : connexion refusee, interrompue ou inaccessible.';
  }
  return 'Reseau/TLS : connexion HTTPS impossible. Verifier Internet, le proxy et le pare-feu.';
}

export async function checkCredentials(values, { fetchImpl = fetch, log = console.log } = {}) {
  const checks = [
    { name: 'SFU', id: values.sfuAppId, secret: values.sfuSecret,
      // sessions/new without SDP must have no body, including no empty JSON object.
      path: `apps/${encodeURIComponent(values.sfuAppId)}/sessions/new`,
      valid: data => typeof data?.sessionId === 'string' && data.sessionId.length > 0 },
    { name: 'TURN', id: values.turnKeyId, secret: values.turnToken,
      path: `turn/keys/${encodeURIComponent(values.turnKeyId)}/credentials/generate-ice-servers`, body: { ttl: 86400 },
      valid: data => Array.isArray(data?.iceServers) && data.iceServers.length > 0 },
  ];
  let passed = true;
  for (const check of checks) {
    if (!/^[a-f\d]{32}$/i.test(check.id || '') || typeof check.secret !== 'string' ||
        !check.secret || /\s|["']/.test(check.secret) || /^Bearer\b/i.test(check.secret)) {
      log(`${check.name} ECHEC - Saisir le secret seul, sans guillemets, espaces ni prefixe Bearer, et verifier son ID.`);
      passed = false;
      continue;
    }
    let response;
    try {
      response = await fetchImpl(`${base}/${check.path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${check.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(check.body), signal: AbortSignal.timeout(30_000), redirect: 'manual',
      });
    } catch (error) {
      log(`${check.name} ECHEC - ${networkReason(error)}`);
      passed = false;
      continue;
    }
    let data;
    try { data = await response.json(); } catch { /* Never print raw HTML or provider responses. */ }
    if (response.ok && !data?.errorCode && check.valid(data)) {
      log(`${check.name} OK - identifiant et secret acceptes.`);
      continue;
    }
    passed = false;
    const code = publicCodes.has(data?.errorCode) ? ` (${data.errorCode})` : '';
    let advice = 'Reponse Cloudflare inattendue.';
    if ([401, 403].includes(response.status) || data?.errorCode === 'unauthorized') {
      advice = check.name === 'SFU'
        ? "App Secret refuse : utiliser le secret de cette application SFU, pas l'App ID ni un token general du compte."
        : 'Token refuse : utiliser le token associe a cette cle TURN, pas le Key ID ni le secret SFU.';
    } else if (response.status === 404 || data?.errorCode === 'not_found') {
      advice = 'Ressource introuvable : verifier son ID et son compte Cloudflare.';
    } else if (response.status === 429) advice = 'Trop de requetes : patienter avant de relancer.';
    else if (response.status >= 500) advice = 'Service Cloudflare indisponible : reessayer plus tard.';
    else if (response.status >= 300 && response.status < 400) advice = 'Redirection inattendue : aucun secret retransmis.';
    else if (response.status === 400) advice = 'Requete refusee par Cloudflare : transmettre ce diagnostic pour correction.';
    log(`${check.name} ECHEC - HTTP ${response.status}${code}. ${advice}`);
  }
  return passed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16_384) throw new Error('Invalid input');
    }
    process.exitCode = await checkCredentials(JSON.parse(input.replace(/^\uFEFF/, ''))) ? 0 : 1;
  } catch {
    // Deliberately omit raw exception messages: these may contain credentials.
    console.log('Diagnostic impossible : donnees de configuration invalides. Relancer setup.ps1.');
    process.exitCode = 1;
  }
}
