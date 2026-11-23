import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkCredentials } from '../scripts/check-credentials.mjs';

const values = { sfuAppId: 'a'.repeat(32), sfuSecret: 'fake-sfu-secret', turnKeyId: 'b'.repeat(32), turnToken: 'fake-turn-secret' };
const good = url => Response.json(url.includes('/sessions/') ? { sessionId: 'private-session' } : { iceServers: [{ credential: 'private-turn-credential' }] });
async function run(fetchImpl, input = values) {
  const messages = [];
  const ok = await checkCredentials(input, { fetchImpl, log: message => messages.push(message) });
  const output = messages.join('\n');
  for (const secret of [values.sfuSecret, values.turnToken, 'private-session', 'private-turn-credential', 'private-error-marker']) {
    assert.ok(!output.includes(secret), 'A diagnostic exposed sensitive data');
  }
  return { ok, output, messages };
}

test('validates SFU and TURN with separate credentials, without printing responses', async () => {
  const calls = [];
  const result = await run(async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, `Bearer ${url.includes('/sessions/') ? values.sfuSecret : values.turnToken}`);
    const request = new Request(url, options);
    if (url.includes('/sessions/')) {
      assert.equal(request.body, null, 'Session creation must not send an empty JSON object');
      assert.equal(await request.text(), '');
    } else {
      assert.deepEqual(await request.json(), { ttl: 86400 });
    }
    return good(url);
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(result.output, /SFU OK/);
  assert.match(result.output, /TURN OK/);
});

test('identifies a refused SFU secret while still checking TURN', async () => {
  const result = await run(async url => url.includes('/sessions/')
    ? Response.json({ errorCode: 'unauthorized', errorDescription: values.sfuSecret }, { status: 401 }) : good(url));
  assert.equal(result.ok, false);
  assert.match(result.output, /SFU ECHEC - HTTP 401 \(unauthorized\)/);
  assert.match(result.output, /TURN OK/);
});

test('identifies a refused TURN token without treating the valid SFU secret as wrong', async () => {
  const result = await run(async url => url.includes('/sessions/') ? good(url)
    : Response.json({ errorCode: 'private-error-marker', errorDescription: values.turnToken }, { status: 403 }));
  assert.equal(result.ok, false);
  assert.match(result.output, /SFU OK/);
  assert.match(result.output, /TURN ECHEC - HTTP 403/);
});

test('reports DNS, certificate and timeout failures without exception text', async () => {
  for (const [code, expected] of [['ENOTFOUND', /DNS/], ['CERT_HAS_EXPIRED', /TLS/], ['UND_ERR_CONNECT_TIMEOUT', /delai/]]) {
    const result = await run(async () => { throw new Error(values.sfuSecret, { cause: { code, message: values.turnToken } }); });
    assert.equal(result.ok, false);
    assert.match(result.output, expected);
    assert.equal(result.messages.length, 2);
  }
});

test('rejects malformed successful responses and API errors in HTTP 200', async () => {
  const result = await run(async url => url.includes('/sessions/')
    ? Response.json({ errorCode: 'not_found', sessionId: 'private-session' })
    : new Response(`<html>${values.turnToken}</html>`, { status: 200 }));
  assert.equal(result.ok, false);
  assert.match(result.output, /SFU ECHEC - HTTP 200 \(not_found\)/);
  assert.match(result.output, /TURN ECHEC - HTTP 200/);
});

test('does not follow a credential-bearing request redirect', async () => {
  const result = await run(async (_url, options) => {
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 307, headers: { Location: `https://example.invalid/${values.sfuSecret}` } });
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /HTTP 307/);
  assert.match(result.output, /Redirection inattendue/);
});

test('rejects pasted Bearer prefixes without sending malformed credentials', async () => {
  let calls = 0;
  const result = await run(async url => { calls++; return good(url); }, { ...values, sfuSecret: `Bearer ${values.sfuSecret}` });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.match(result.output, /SFU ECHEC - Saisir le secret seul/);
  assert.match(result.output, /TURN OK/);
});

test('CLI rejects invalid input without echoing input or a stack trace', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-credentials.mjs', import.meta.url))], {
    input: `invalid-json-${values.sfuSecret}`, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Diagnostic impossible/);
  assert.ok(!result.stdout.includes(values.sfuSecret));
  assert.equal(result.stderr, '');
});
