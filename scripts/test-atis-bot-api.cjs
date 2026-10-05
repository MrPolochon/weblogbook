const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/atis-bot-api.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUnderTest = { exports: {} };
new Function('require', 'module', 'exports', compiled)(() => ({ createAdminClient() { throw new Error('Unexpected database access'); } }), moduleUnderTest, moduleUnderTest.exports);
const { fetchAtisBot } = moduleUnderTest.exports;
const originalFetch = global.fetch;
const oldUrl = process.env.ATIS_WEBHOOK_URL;
const oldSecret = process.env.ATIS_WEBHOOK_SECRET;
function configure() {
  process.env.ATIS_WEBHOOK_URL = 'https://atis.example.test/';
  process.env.ATIS_WEBHOOK_SECRET = 'test-only-secret';
}
afterEach(() => {
  global.fetch = originalFetch;
  if (oldUrl === undefined) delete process.env.ATIS_WEBHOOK_URL; else process.env.ATIS_WEBHOOK_URL = oldUrl;
  if (oldSecret === undefined) delete process.env.ATIS_WEBHOOK_SECRET; else process.env.ATIS_WEBHOOK_SECRET = oldSecret;
});

test('missing configuration does not contact the bot', async () => {
  delete process.env.ATIS_WEBHOOK_URL;
  global.fetch = async () => { throw new Error('Must not fetch'); };
  assert.equal((await fetchAtisBot('/webhook/health')).status, 503);
});
test('commands target the selected instance and carry their JSON payload', async () => {
  configure();
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://atis.example.test/webhook/2/start');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { airport: 'IRFD' });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  assert.deepEqual((await fetchAtisBot('/webhook/start', { instanceId: 2, method: 'POST', body: { airport: 'IRFD' } })).data, { ok: true });
});
test('an HTML response cannot report success', async () => {
  configure();
  global.fetch = async () => new Response('<html>Unavailable</html>', { status: 200 });
  const result = await fetchAtisBot('/webhook/health');
  assert.equal(result.status, 502);
  assert.ok(result.error);
});
test('authentication failures remain failures', async () => {
  configure();
  global.fetch = async () => new Response('{}', { status: 401 });
  assert.equal((await fetchAtisBot('/webhook/health')).status, 401);
});
test('timeout also covers reading the response body', async () => {
  configure();
  global.fetch = async (_url, { signal }) => ({
    ok: true, status: 200,
    json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })),
  });
  const result = await fetchAtisBot('/webhook/health', { timeoutMs: 10 });
  assert.ok(result.error);
  assert.notEqual(result.status, 200);
});
