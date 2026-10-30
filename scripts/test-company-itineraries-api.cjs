const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const id = n => `${String(n).padStart(8, '0')}-5555-4555-8555-555555555555`;
const actor = id(1), company = id(10), aircraft = id(20), itinerary = id(30), leg = id(40);
class FlightSubmissionError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
const submission = { FlightSubmissionError, submissionError: error => new FlightSubmissionError(error?.message || 'Indisponible', ['PGRST202', '42P01'].includes(error?.code) ? 503 : 409) };
function load(path, deps) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => {
    if (!(name in deps)) throw Error(`Unexpected dependency ${name}`);
    return deps[name];
  }, m, m.exports);
  return m.exports;
}
const input = load('src/lib/company-itineraries/input.ts', { '@/lib/aeroports-ptfs': { CODES_OACI_VALIDES: new Set(['IRFD', 'ILAR', 'ITKO']) }, '@/lib/plans-vol/submission': submission });
const body = changes => ({ request_id: id(50), compagnie_avion_id: aircraft, numero_vol: 'TEST123', aeroport_depart: 'IRFD', segments: [{ aeroport_arrivee: 'ILAR', type_vol: 'IFR', temps_prev_min: 18 }, { aeroport_arrivee: 'ITKO', type_vol: 'VFR', temps_prev_min: 20 }], ...changes });
function fixture(options = {}) {
  const calls = [], deposits = [];
  const detail = options.detail || { itinerary: { id: itinerary, pilot_id: actor, company_id: company, aircraft_id: aircraft, flight_number: 'TEST123', nature_transport: 'passagers', status: 'paused' }, legs: [{ id: leg, origin: 'ILAR', destination: 'ITKO', plan_id: null, preparation: { type_vol: 'VFR', temps_prev_min: 20 } }], next_leg: { id: leg } };
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.anonymous ? null : { id: actor } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return options.error ? { error: options.error } : { data: { ok: true, id: itinerary } }; } }) },
    '@/lib/plans-vol/submission': submission,
    '@/lib/company-itineraries/input': input,
    '@/lib/company-itineraries/server': { companyItineraries: async () => ({ unlocked: true, itineraries: [] }), itineraryDetail: async () => detail },
    '@/lib/rate-limit-shared': { rateLimitShared: async () => ({ allowed: !options.limited }) },
    '@/app/api/plans-vol/route': { POST: async request => { deposits.push(await request.json()); return { body: { id: id(60) }, status: 200 }; } },
  };
  return { calls, deposits, create: load('src/app/api/compagnies/[id]/itineraires/route.ts', deps), resume: load('src/app/api/itineraires/[id]/reprendre/route.ts', deps), cancel: load('src/app/api/itineraires/[id]/annuler/route.ts', deps) };
}
const params = value => ({ params: Promise.resolve({ id: value }) });
const request = value => new Request('https://example.test/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

test('itinerary input strips client demand, money, identity and plan status', () => {
  const normalized = input.itineraryInput(body({ pilot_id: id(999), nb_pax_genere: 999, revenue_brut: 9999, segments: [{ ...body().segments[0], statut: 'cloture', salaire_pilote: 9999, nb_pax_genere: 999, heure_depart: '12:30' }, body().segments[1]] }));
  assert.equal(normalized.pilot_id, undefined); assert.equal(normalized.nb_pax_genere, undefined);
  assert.equal(normalized.segments[0].statut, undefined); assert.equal(normalized.segments[0].salaire_pilote, undefined); assert.equal(normalized.segments[0].nb_pax_genere, undefined);
  assert.equal(normalized.segments[0].heure_depart, '12:30');
  for (const changes of [{ request_id: 'bad' }, { segments: [] }, { segments: Array(6).fill(body().segments[0]) }, { segments: [{ ...body().segments[0], aeroport_arrivee: 'IRFD' }, body().segments[1]] }]) assert.throws(() => input.itineraryInput(body(changes)), FlightSubmissionError);
});
test('create binds the authenticated actor and path company to the atomic RPC', async () => {
  const f = fixture(), result = await f.create.POST(request(body({ pilot_id: id(999), compagnie_id: id(999) })), params(company));
  assert.equal(result.status, 200); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].name, 'create_company_itinerary');
  assert.equal(f.calls[0].args.p_actor, actor); assert.equal(f.calls[0].args.p_company, company); assert.equal(f.calls[0].args.p_input.pilot_id, undefined);
});
test('anonymous, throttled or invalid creation never reaches the database', async () => {
  for (const [options, value, expected] of [[{ anonymous: true }, body(), 401], [{ limited: true }, body(), 429], [{}, body({ request_id: 'bad' }), 400]]) {
    const f = fixture(options); assert.equal((await f.create.POST(request(value), params(company))).status, expected); assert.equal(f.calls.length, 0);
  }
});
test('missing itinerary migration fails closed with a service unavailable response', async () => {
  const f = fixture({ error: { code: 'PGRST202', message: 'Mise à jour requise' } });
  assert.equal((await f.create.POST(request(body()), params(company))).status, 503); assert.equal(f.calls.length, 1);
});
test('resume injects the immutable route and reuses all ordinary plan deposit checks', async () => {
  const f = fixture();
  assert.equal((await f.resume.POST(request({ leg_id: leg, compagnie_id: id(999), compagnie_avion_id: id(999), aeroport_depart: 'IRFD', aeroport_arrivee: 'IRFD', armee_avion_id: id(999), vol_commercial: false, vol_ferry: true, heure_depart: '13:00', intentions_vol: 'Navigation' }), params(itinerary))).status, 200);
  const p = f.deposits[0]; assert.equal(p.compagnie_id, company); assert.equal(p.compagnie_avion_id, aircraft); assert.equal(p.aeroport_depart, 'ILAR'); assert.equal(p.aeroport_arrivee, 'ITKO');
  assert.equal(p.itinerary_id, itinerary); assert.equal(p.itinerary_leg_id, leg); assert.equal(p.vol_commercial, true); assert.equal(p.vol_ferry, false); assert.equal(p.armee_avion_id, null);
  assert.equal(p.heure_depart, '13:00'); assert.equal(p.type_vol, 'VFR'); assert.equal(p.temps_prev_min, 20);
});
test('resume never submits a second plan for a replay or after diversion', async () => {
  for (const status of ['paused', 'diverted']) {
    const detail = { itinerary: { id: itinerary, pilot_id: actor, status }, legs: [{ id: leg, origin: 'ILAR', destination: 'ITKO', plan_id: status === 'paused' ? id(60) : null }], next_leg: { id: leg } };
    const f = fixture({ detail }), response = await f.resume.POST(request({ leg_id: leg }), params(itinerary));
    assert.equal(response.status, status === 'paused' ? 200 : 409); assert.equal(f.deposits.length, 0);
  }
});
test('only the assigned pilot may resume, and cancellation binds the caller identity', async () => {
  const f = fixture({ detail: { itinerary: { pilot_id: id(999) }, legs: [] } });
  assert.equal((await f.resume.POST(request({ leg_id: leg }), params(itinerary))).status, 403); assert.equal(f.deposits.length, 0);
  assert.equal((await f.cancel.POST(request({ pilot_id: id(999) }), params(itinerary))).status, 200);
  assert.equal(f.calls[0].args.p_actor, actor); assert.equal(f.calls[0].args.p_itinerary, itinerary);
});
