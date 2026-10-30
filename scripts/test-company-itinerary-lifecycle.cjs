const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const id = n => `${String(n).padStart(8, '0')}-6666-4666-8666-666666666666`;
const actor = id(1), user = id(2), company = id(10), aircraft = id(20);
class FlightSubmissionError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const submission = { FlightSubmissionError, submissionError: e => new FlightSubmissionError(e?.message || 'Indisponible', e?.code === 'PGRST202' ? 503 : 409) };
function load(path, deps) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => name in deps ? deps[name] : require(name), m, m.exports);
  return m.exports;
}
const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
const request = body => ({ json: async () => body });

test('automatic account deletion stops before any side effect when itinerary preflight fails', async () => {
  const calls = [], error = new FlightSubmissionError('Historique de vol clôturé à conserver', 409);
  const api = load('src/lib/delete-user.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from() { calls.push('table'); throw Error('Must never reach cleanup'); } }) },
    '@/lib/atis-bot-api': { stopAtisIfController: async () => calls.push('atis') },
    '@/lib/company-itineraries/lifecycle': { prepareItineraryAccountDeletion: async () => { throw error; }, releaseItineraryAccountDeletion: async () => calls.push('release') },
  });
  await assert.rejects(api.deleteUserAccount(user), error); assert.deepEqual(calls, []);
});
test('account cleanup releases its token even if a later cleanup step fails', async () => {
  const calls = [];
  const api = load('src/lib/delete-user.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => ({ from() { throw Error('cleanup failed'); } }) },
    '@/lib/atis-bot-api': { stopAtisIfController: async () => calls.push('atis') },
    '@/lib/company-itineraries/lifecycle': { prepareItineraryAccountDeletion: async () => 'token', releaseItineraryAccountDeletion: async (_a, id, token) => calls.push({ id, token }) },
  });
  await assert.rejects(api.deleteUserAccount(user), /cleanup failed/); assert.deepEqual(calls, ['atis', { id: user, token: 'token' }]);
});
test('manual account deletion fails before archives, payments, storage or dependency cleanup', async () => {
  const writes = [];
  const admin = { from(table) { const q = { select() { return q; }, eq() { return q; }, gte() { return q; }, single: async () => ({ data: { role: 'pilote', identifiant: 'Pilot' } }), then(resolve) { return Promise.resolve({ count: 0 }).then(resolve); }, insert() { writes.push(table); return q; }, delete() { writes.push(table); return q; }, update() { writes.push(table); return q; } }; return q; } };
  const api = load('src/app/api/pilotes/[id]/route.ts', {
    'next/server': next,
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { role: 'admin' } }) }) }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/constants': {}, '@/lib/delete-user': {}, '@/lib/plans-vol/submission': submission,
    '@/lib/company-itineraries/lifecycle': { prepareItineraryAccountDeletion: async () => { throw new FlightSubmissionError('Vol clôturé à conserver', 409); }, releaseItineraryAccountDeletion: async () => writes.push('release') },
  });
  const result = await api.DELETE(request({}), { params: Promise.resolve({ id: user }) });
  assert.equal(result.status, 409); assert.deepEqual(writes, []);
});

function ferryFixture(options = {}) {
  const writes = [], rpc = [];
  const admin = { from(table) {
    let inserted = false;
    const row = () => table === 'compagnies' ? { id: company, pdg_id: actor } : table === 'compagnie_avions' ? { id: aircraft, compagnie_id: company, aeroport_actuel: 'IRFD', statut: 'ground', usure_percent: 100 } : table === 'compagnie_hubs' ? { id: id(40) } : table === 'taxes_aeroport' ? { taxe_pourcent: 2 } : table === 'felitz_comptes' ? { id: id(50), solde: 100000 } : table === 'vols_ferry' ? { id: id(60), avion_id: aircraft, compagnie_id: company, pilote_id: actor, statut: options.ferryStatus || 'planned', avion: { id: aircraft, usure_percent: 100 } } : null;
    const response = () => inserted && options.insertConflict ? { data: null, error: { message: 'Appareil réservé à un itinéraire' } } : { data: row(), error: null };
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; }, single: async () => response(), maybeSingle: async () => response(), insert(data) { writes.push({ table, data }); inserted = true; return q; }, update(data) { writes.push({ table, data }); return q; }, delete() { writes.push({ table, delete: true }); return q; }, then(resolve) { return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve); } }; return q;
  }, rpc: async (name, args) => { rpc.push({ name, args }); return { data: true }; } };
  const deps = {
    'next/server': next,
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { role: 'admin' } }) }) }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin }, '@/lib/plans-vol/submission': submission,
    '@/lib/compagnie-utils': { COUT_VOL_FERRY: 10000, calculerVolFerryAuto: () => ({ cout: 50000, dureeMin: 90 }), calculerUsureFerry: () => 5 },
    '@/lib/co-pdg-utils': { isCoPdg: async () => false }, '@/lib/reparation-after-ferry': {}, '@/lib/vols-ferry-auto': {}, '@/lib/felitz/ensure-comptes': {},
    '@/lib/company-itineraries/lifecycle': { assertAircraftOutsideItinerary: async () => { if (options.reserved) throw new FlightSubmissionError('Appareil réservé à un itinéraire', 409); } },
  };
  return { writes, rpc, api: load('src/app/api/compagnies/vols-ferry/route.ts', deps), detail: load('src/app/api/compagnies/vols-ferry/[id]/route.ts', deps) };
}
test('reserved aircraft ferry preflight returns before insertion, debit or aircraft mutation', async () => {
  const f = ferryFixture({ reserved: true }); const result = await f.api.POST(request({ compagnie_id: company, avion_id: aircraft, aeroport_arrivee: 'ILAR', automatique: true }));
  assert.equal(result.status, 409); assert.deepEqual(f.writes, []); assert.deepEqual(f.rpc, []);
});
test('reservation race rejected by the ferry INSERT trigger never reaches the debit or ledger', async () => {
  const f = ferryFixture({ insertConflict: true }); const result = await f.api.POST(request({ compagnie_id: company, avion_id: aircraft, aeroport_arrivee: 'ILAR', automatique: false }));
  assert.equal(result.status, 400); assert.equal(f.writes.length, 1); assert.equal(f.writes[0].table, 'vols_ferry'); assert.deepEqual(f.rpc, []);
});
test('an old cancelled ferry cannot close again and move a newly reserved aircraft', async () => {
  const f = ferryFixture({ ferryStatus: 'cancelled' }); const result = await f.detail.PATCH(request({ action: 'cloturer' }), { params: Promise.resolve({ id: id(60) }) });
  assert.equal(result.status, 400); assert.deepEqual(f.writes, []); assert.deepEqual(f.rpc, []);
});
test('manual ferry completion refuses itinerary reservation before relocating or applying wear', async () => {
  const f = ferryFixture({ reserved: true }); const result = await f.detail.PATCH(request({ action: 'cloturer' }), { params: Promise.resolve({ id: id(60) }) });
  assert.equal(result.status, 409); assert.deepEqual(f.writes, []); assert.deepEqual(f.rpc, []);
});
