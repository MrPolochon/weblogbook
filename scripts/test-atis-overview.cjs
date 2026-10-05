const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/app/api/atc/atis/overview/route.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(botInstances, readError = null) {
  const row = { id: '1', controlling_user_id: 'controller', aeroport: 'IPPH', position: 'CENTER', broadcasting: true, source: 'site', started_at: new Date().toISOString() };
  const admin = { from(table) {
    const result = table === 'atis_broadcast_state' ? { data: [row], error: readError } : { data: [], error: null };
    const query = { select() { return this; }, order() { return this; }, in() { return this; }, eq() { return this; }, maybeSingle() { return Promise.resolve({ data: null }); }, update() { throw new Error('Polling deleted the start reservation'); }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
    return query;
  } };
  const dependencies = {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'controller' } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { role: 'admin' } }) }) }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/atis-bot-api': { getBotOverview: async () => ({ data: { instances: botInstances, guilds: [{ id: 'guild', name: 'Guild' }] } }), getCachedGuilds: async () => ({ guilds: [] }) },
    '@/lib/atis-priority': { identifiantFromJoin: () => null },
  };
  const m = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => dependencies[name], m, m.exports);
  return { GET: m.exports.GET, row };
}
test('polling during bot startup preserves the reservation and controller', async () => {
  const { GET, row } = load([{ instance_id: 1, broadcasting: false }]);
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(row.broadcasting, true);
  assert.equal(response.body.instances[0].controlling_user_id, 'controller');
  assert.equal(response.body.instances[0].db_broadcasting, true);
});
test('an omitted bot instance is unknown rather than stopped', async () => {
  const { GET } = load([]);
  const response = await GET();
  assert.equal(response.body.instances[0].broadcasting, true);
  assert.equal(response.body.instances[0].desync, false);
});
test('a database outage cannot appear as an empty broadcast state', async () => {
  const { GET } = load([], { message: 'Unavailable' });
  assert.equal((await GET()).status, 503);
});
