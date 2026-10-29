const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPilotFixture } = require('./helpers/pilot-fixture.cjs');

test('pilot route boundaries and current section do not capture other operational spaces', () => {
  const { load } = createPilotFixture();
  const nav = load('src/lib/pilot-navigation.ts');
  for (const route of ['/pilote', '/logbook/plans-vol/abc/modifier', '/inventaire', '/ma-compagnie', '/felitz-bank']) assert(nav.isPilotWorkspacePath(route));
  for (const route of ['/admin', '/atc', '/siavi', '/ground', '/logbook-export', '/pilote-factice']) assert(!nav.isPilotWorkspacePath(route));
  assert.equal(nav.activePilotSection('/logbook/depot-plan-vol'), '/logbook/plans-vol');
  assert.equal(nav.activePilotSection('/logbook/vol/abc'), '/logbook');
});

test('signed-out pilot dashboard redirects before querying private data', async () => {
  const fixture = createPilotFixture({ signedOut: true });
  await assert.rejects(fixture.render(), /REDIRECT:\/login/);
  assert.equal(fixture.queries.length, 0);
});

test('dashboard uses bounded owner-scoped reads and keeps personal balance separate from pending income', async () => {
  const fixture = createPilotFixture();
  const html = await fixture.render(true);
  assert.match(html, /MX204/); assert.match(html, /IRFD/); assert.match(html, /Copilote/);
  assert.match(html, /hors chèques non encaissés/); assert.match(html, /Salle de préparation du vol/);
  for (const query of fixture.queries) {
    if (query.table === 'logbook_summary') { assert.equal(query.args.p_user_id, fixture.userId); continue; }
    if (query.table === 'get_unrecorded_closed_plans') { assert.equal(query.args.p_pilot, fixture.userId); assert.equal(query.args.p_limit, 1); continue; }
    assert(query.filters.some(f => f.value === fixture.userId || typeof f.value === 'string' && f.value.includes(fixture.userId)), query.table + ' must be scoped to the signed-in pilot');
  }
  const plans = fixture.queries.find(q => q.table === 'plans_vol' && !q.head);
  assert.equal(plans.limit, 6);
  assert(fixture.queries.some(q => q.table === 'get_unrecorded_closed_plans'), 'the closed-plan count must share the query that excludes registered records of every status');
  const account = fixture.queries.find(q => q.table === 'felitz_comptes');
  assert.equal(account.limit, 1); assert(account.filters.some(f => f.field === 'type' && f.value === 'personnel'));
  assert(account.orders.some(o => o.field === 'created_at' && o.value.ascending));
});

test('read failures never masquerade as an empty flight list or a zero bank balance', async () => {
  const fixture = createPilotFixture({ errors: ['plans_vol', 'felitz_comptes', 'logbook_summary'] });
  const html = await fixture.render();
  assert.match(html, /role="alert"/); assert.match(html, /Indisponible/);
  assert.doesNotMatch(html, /Aucun plan de vol ouvert/); assert.doesNotMatch(html, />0 F\$/);
});

test('genuine empty state offers preparation without inventing a personal account', async () => {
  const html = await createPilotFixture({ noPlans: true, noAccount: true }).render();
  assert.match(html, /Aucun plan de vol ouvert/); assert.match(html, /Aucun compte/);
  assert.match(html, /href="\/logbook\/depot-plan-vol"/);
  assert.doesNotMatch(html, /role="alert"/);
});

test('closed-plan query failures stay unavailable instead of becoming zero unrecorded flights', async () => {
  const html = await createPilotFixture({ errors: ['get_unrecorded_closed_plans'] }).render();
  assert.match(html, /role="alert"/);
  assert.match(html, /Vérifier les vols à ajouter au carnet/);
});

test('unrecorded list preserves its full count and rejects malformed or failed results', async () => {
  const { load } = createPilotFixture();
  const { loadUnrecordedClosedPlans } = load('src/lib/logbook-registration.ts');
  const calls = [];
  const rpc = async (name, args) => { calls.push({ name, args }); return { data: [{ id: 'closed-plan', available_count: '253' }], error: null }; };
  const result = await loadUnrecordedClosedPlans({ rpc }, 'pilot-owner', 1);
  assert.equal(result.count, 253);
  assert.equal(result.data.length, 1);
  assert.deepEqual(calls, [{ name: 'get_unrecorded_closed_plans', args: { p_pilot: 'pilot-owner', p_limit: 1 } }]);
  for (const response of [{ data: null, error: { message: 'offline' } }, { data: null, error: null }, { data: [{ id: 'plan' }], error: null }]) {
    const failed = await loadUnrecordedClosedPlans({ rpc: async () => response }, 'pilot-owner');
    assert(failed.error); assert.equal(failed.count, null);
  }
  assert.equal((await loadUnrecordedClosedPlans({ rpc: async () => ({ data: [], error: null }) }, 'pilot-owner')).count, 0);
});
