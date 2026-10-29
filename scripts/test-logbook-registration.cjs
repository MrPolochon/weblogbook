const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const userId = id(1), planId = id(10), flightId = id(20);
const requestBody = overrides => ({ type_vol: 'IFR', type_avion_id: id(30), compagnie_id: id(31), compagnie_libelle: 'Compagnie test', aeroport_depart: 'IRFD', aeroport_arrivee: 'ILAR', duree_minutes: 10, depart_utc: '2026-10-29T18:33:00Z', commandant_bord: 'Pilote test', role_pilote: 'Pilote', callsign: 'GRM5504', plan_id: planId, ...overrides });

function routeFixture(options = {}) {
  const calls = [], directWrites = [], profileReads = [], qualificationChecks = [];
  const profiles = new Map([
    [userId, { id: userId, role: options.role ?? 'pilote', blocked_until: options.blockedUntil ?? null }],
    [id(2), { id: id(2), role: 'pilote' }],
    [id(3), { id: id(3), role: 'instructeur' }],
  ]);
  function from(table) {
    if (table !== 'profiles') {
      directWrites.push(table);
      throw new Error('An ordinary registration must use the atomic RPC, never a separate write');
    }
    const state = { table, id: null }; profileReads.push(state);
    const q = { select() { return q; }, eq(field, value) { if (field === 'id') state.id = value; return q; }, async single() { return { data: options.noProfile && state.id === userId ? null : profiles.get(state.id) ?? null, error: null }; } };
    return q;
  }
  const admin = { from, async rpc(name, args) {
    calls.push({ name, args: structuredClone(args) });
    if (options.rpc) return options.rpc(name, args);
    return { data: options.rpcData === undefined ? { ok: true, id: flightId, duplicate: false, plan_id: planId, statut: 'en_attente' } : options.rpcData, error: options.rpcError ?? null };
  } };
  const client = { from, auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: userId } } }) } };
  const deps = {
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    'next/server': { NextResponse: { json: (body, opts) => ({ body, status: opts?.status ?? 200 }) } },
    '@/lib/aeroports-ptfs': { CODES_OACI_VALIDES: new Set(['IRFD', 'ILAR']) },
    '@/lib/armee': {},
    '@/lib/instruction-permissions': { isQualifiedFlightInstructorInLogbook: async (...args) => { qualificationChecks.push(args); return options.instructorQualified ?? true; } },
  };
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/api/vols/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => deps[name] ?? require(name), m, m.exports);
  return { calls, directWrites, profileReads, qualificationChecks, post: body => m.exports.POST({ json: async () => body }) };
}

test('civil flight registration submits actor, pending record and source plan in one operation', async () => {
  const fixture = routeFixture(); const res = await fixture.post(requestBody());
  assert.equal(res.status, 200); assert.equal(res.body.id, flightId); assert.equal(res.body.already_registered, false);
  assert.equal(fixture.calls.length, 1);
  const call = fixture.calls[0];
  assert.equal(call.name, 'register_logbook_flight'); assert.equal(call.args.p_actor, userId); assert.equal(call.args.p_plan_id, planId);
  assert.equal(call.args.p_row.pilote_id, userId); assert.equal(call.args.p_row.statut, 'en_attente');
  assert.equal(call.args.p_row.callsign, 'GRM5504'); assert.equal(call.args.p_row.depart_utc, '2026-10-29T18:33:00.000Z');
  assert.equal(call.args.p_row.arrivee_utc, '2026-10-29T18:43:00.000Z');
  assert.deepEqual(fixture.directWrites, []);
});

test('an existing logbook entry remains an existing entry even while staff or crew confirmation is pending', async () => {
  for (const statut of ['en_attente', 'validé', 'refusé', 'en_attente_confirmation_pilote', 'en_attente_confirmation_copilote', 'en_attente_confirmation_instructeur', 'refuse_par_copilote']) {
    const fixture = routeFixture({ rpcData: { ok: true, id: flightId, duplicate: true, plan_id: planId, statut } });
    const res = await fixture.post(requestBody());
    assert.equal(res.status, 200); assert.equal(res.body.id, flightId); assert.equal(res.body.already_registered, true); assert.equal(res.body.statut, statut);
    assert.equal(fixture.calls.length, 1); assert.deepEqual(fixture.directWrites, []);
  }
});

test('source plan aliases are supported and conflicting or malformed identifiers never reach registration', async () => {
  for (const body of [requestBody({ plan_id: undefined, plan_vol_id: planId }), requestBody({ plan_id: planId, plan_vol_id: planId })]) {
    const fixture = routeFixture(); assert.equal((await fixture.post(body)).status, 200); assert.equal(fixture.calls[0].args.p_plan_id, planId);
  }
  for (const body of [requestBody({ plan_id: 'not-a-plan' }), requestBody({ plan_id: 42 }), requestBody({ plan_vol_id: id(11) })]) {
    const fixture = routeFixture(); assert.equal((await fixture.post(body)).status, 400); assert.equal(fixture.calls.length, 0); assert.deepEqual(fixture.directWrites, []);
  }
  const manual = routeFixture(); assert.equal((await manual.post(requestBody({ plan_id: undefined }))).status, 200); assert.equal(manual.calls[0].args.p_plan_id, null);
});

test('an unavailable registration migration fails visibly without reverting to an unsafe separate insertion', async () => {
  for (const code of ['PGRST202', '42883']) {
    const fixture = routeFixture({ rpcData: null, rpcError: { code, message: 'private internal function detail' } });
    const res = await fixture.post(requestBody());
    assert.equal(res.status, 503); assert.match(res.body.error, /mise à jour|migration|indisponible/i); assert.doesNotMatch(res.body.error, /private internal/);
    assert.equal(fixture.calls.length, 1); assert.deepEqual(fixture.directWrites, []);
  }
});

test('atomic business refusals preserve their message and status without any application-side marking', async () => {
  for (const status of [400, 403, 409]) {
    const fixture = routeFixture({ rpcData: { ok: false, error: 'Plan déjà traité ou non autorisé', status } });
    const res = await fixture.post(requestBody());
    assert.equal(res.status, status); assert.equal(res.body.error, 'Plan déjà traité ou non autorisé'); assert.deepEqual(fixture.directWrites, []);
  }
  for (const options of [{ rpcError: { code: 'XX000', message: 'private database failure' }, rpcData: null }, { rpcData: null }, { rpcData: { ok: true, id: null } }]) {
    const fixture = routeFixture(options); const res = await fixture.post(requestBody());
    assert.equal(res.status, 500); assert.doesNotMatch(res.body.error, /private database/); assert.deepEqual(fixture.directWrites, []);
  }
});

test('authentication, blocks and required fields are checked before the registration transaction', async () => {
  for (const [options, status] of [[{ signedOut: true }, 401], [{ noProfile: true }, 403], [{ blockedUntil: '2100-01-01T00:00:00Z' }, 403]]) {
    const fixture = routeFixture(options); assert.equal((await fixture.post(requestBody())).status, status); assert.equal(fixture.calls.length, 0);
  }
  const fixture = routeFixture(); assert.equal((await fixture.post(requestBody({ duree_minutes: 0 }))).status, 400); assert.equal(fixture.calls.length, 0);
});

test('copilot and instruction confirmation requirements survive the move to atomic registration', async () => {
  const copilote = routeFixture();
  assert.equal((await copilote.post(requestBody({ role_pilote: 'Co-pilote', pilote_id: id(2) }))).status, 200);
  assert.equal(copilote.calls[0].args.p_row.pilote_id, id(2)); assert.equal(copilote.calls[0].args.p_row.copilote_id, userId);
  assert.equal(copilote.calls[0].args.p_row.statut, 'en_attente_confirmation_pilote');
  const instruction = routeFixture();
  assert.equal((await instruction.post(requestBody({ type_vol: 'Instruction', instructeur_id: id(3), instruction_type: 'IFR initial' }))).status, 200);
  assert.equal(instruction.calls[0].args.p_row.statut, 'en_attente_confirmation_instructeur'); assert.equal(instruction.qualificationChecks.length, 1);
  const denied = routeFixture({ instructorQualified: false });
  assert.equal((await denied.post(requestBody({ type_vol: 'Instruction', instructeur_id: id(3), instruction_type: 'IFR initial' }))).status, 400); assert.equal(denied.calls.length, 0);
  const admin = routeFixture({ role: 'admin', rpcData: { ok: true, id: flightId, duplicate: false, statut: 'validé' } });
  assert.equal((await admin.post(requestBody({ created_by_admin: true, pilote_id: id(2) }))).status, 200);
  assert.equal(admin.calls[0].args.p_row.statut, 'validé'); assert.equal(admin.calls[0].args.p_row.created_by_user_id, userId);
});

function formFixture(fetcher) {
  const slots = [], pushes = []; let cursor = 0, tree;
  const React = {
    useState(initial) { const index = cursor++; if (!Object.hasOwn(slots, index)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!Object.hasOwn(slots, index)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {}, useTransition: () => [false, fn => fn()],
  };
  const RecordUtcInput = () => null, RecordFlightSummary = () => null;
  const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: Symbol('Fragment') };
  let refreshes = 0;
  const deps = {
    react: React, 'react/jsx-runtime': runtime,
    'next/navigation': { useRouter: () => ({ push: value => pushes.push(value), refresh: () => { refreshes++; } }) },
    '@/components/logbook/RecordUtcInput': { __esModule: true, default: RecordUtcInput },
    '@/components/logbook/RecordFlightSummary': { __esModule: true, default: RecordFlightSummary },
    '@/lib/aeroports-ptfs': { AEROPORTS_VOL_CIVIL: [] },
    '@/lib/vol-compagnie-libelle': { COMPAGNIE_MEDEVAC_SIAVI: 'SIAVI' },
  };
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/(app)/logbook/nouveau/VolForm.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', 'fetch', code)(name => deps[name] ?? require(name), m, m.exports, fetcher);
  function render() { cursor = 0; tree = m.exports.default({ typesAvion: [{ id: id(30), nom: 'Avion test' }], compagnies: [{ id: id(31), nom: 'Compagnie test' }], instructeurs: [], autresProfiles: [] }); return tree; }
  function collect(value) { if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(item => collect(item)); return [value, ...collect(value.props?.children)]; }
  function nodes(value = tree) { return collect(value); }
  function change(label, value) { const element = nodes().find(el => el.props?.['aria-label'] === label); assert(element, label); element.props.onChange({ target: { value } }); render(); }
  function fill() {
    for (const [label, value] of [['Type d’avion', id(30)], ['Compagnie aérienne', id(31)], ['Aéroport de départ', 'IRFD'], ['Aéroport d’arrivée', 'ILAR'], ['Durée du vol en minutes', '10'], ['Commandant de bord', 'Pilote test']]) change(label, value);
    nodes().find(el => el.type === RecordUtcInput).props.onChange('2026-10-29T18:33'); render();
  }
  render();
  return { render, fill, pushes, nodes, get refreshes() { return refreshes; }, submit: () => tree.props.onSubmit({ preventDefault() {} }) };
}

test('two rapid submissions before React renders issue one registration request', async () => {
  let resolveRequest, requests = 0;
  const request = new Promise(resolve => { resolveRequest = resolve; });
  const fixture = formFixture(async () => { requests++; return request; }); fixture.fill();
  const first = fixture.submit(), second = fixture.submit();
  assert.equal(requests, 1);
  resolveRequest({ ok: true, json: async () => ({ ok: true, id: flightId, already_registered: false }) });
  await Promise.all([first, second]);
  assert.deepEqual(fixture.pushes, ['/logbook?enregistrement=transmis']); assert.equal(fixture.refreshes, 1);
});

test('an idempotent repeat opens the existing record notice and a failed request can be retried', async () => {
  const duplicate = formFixture(async () => ({ ok: true, json: async () => ({ ok: true, id: flightId, already_registered: true }) })); duplicate.fill(); await duplicate.submit();
  assert.deepEqual(duplicate.pushes, ['/logbook?enregistrement=existant']);
  let requests = 0;
  const retry = formFixture(async () => { requests++; return requests === 1 ? { ok: false, json: async () => ({ error: 'Indisponible pour le moment' }) } : { ok: true, json: async () => ({ ok: true, id: flightId, already_registered: false }) }; });
  retry.fill(); await retry.submit(); retry.render();
  assert.equal(retry.pushes.length, 0); assert(retry.nodes().some(el => el.props?.role === 'alert' && el.props.children === 'Indisponible pour le moment'));
  await retry.submit(); assert.equal(requests, 2); assert.deepEqual(retry.pushes, ['/logbook?enregistrement=transmis']);
});
