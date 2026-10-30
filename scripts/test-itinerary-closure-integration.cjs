const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { setup, id, actor, controller, company, aircraft } = require('./fixtures/company-itinerary-economy.cjs');
function load(path, deps) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => deps[name] || {}, m, m.exports);
  return m.exports;
}
test('actual closure API and SQL never advance an itinerary before durable settlement', async t => {
  const db = await setup();
  await db.exec("CREATE FUNCTION company_development_has_unlock(uuid,text,timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;UPDATE economy_release_settings SET enabled=true,activated_at=now()");
  await db.exec(fs.readFileSync('supabase/company_itineraries_20261030.sql', 'utf8'));
  const attempts = [];
  async function dbCall(sql, args = []) {
    await db.exec('SAVEPOINT api_statement');
    try { const result = await db.query(sql, args); await db.exec('RELEASE SAVEPOINT api_statement'); return result; }
    catch (error) { await db.exec('ROLLBACK TO SAVEPOINT api_statement;RELEASE SAVEPOINT api_statement'); throw error; }
  }
  const admin = {
    from(table) {
      let mutation, filters = [];
      const run = async single => {
        try {
          const args = [], bind = value => { args.push(value); return '$' + args.length; };
          let sql = mutation ? `UPDATE ${table} SET ${Object.entries(mutation).map(([key, value]) => `${key}=${bind(value)}`).join(',')}` : `SELECT * FROM ${table}`;
          if (filters.length) sql += ' WHERE ' + filters.map(([key, op, value]) => op === 'in' ? `${key}=ANY(${bind(value)})` : `${key}=${bind(value)}`).join(' AND ');
          if (mutation) { sql += ' RETURNING *'; attempts.push({ table, mutation }); }
          const rows = (await dbCall(sql, args)).rows;
          return { data: single ? rows[0] || null : rows, error: null };
        } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
      };
      const q = { select() { return q; }, update(value) { mutation = value; return q; }, eq(key, value) { filters.push([key, '=', value]); return q; }, in(key, value) { filters.push([key, 'in', value]); return q; }, single: () => run(true), maybeSingle: () => run(true), then(resolve, reject) { return run(false).then(resolve, reject); } };
      return q;
    },
    async rpc(name, args) {
      attempts.push({ rpc: name });
      try {
        const sql = name === 'settle_flight_economy' ? 'SELECT settle_flight_economy($1) r' : name === 'force_close_flight_economy' ? 'SELECT force_close_flight_economy($1,$2) r' : null;
        if (!sql) throw Error('Unexpected RPC ' + name);
        const values = name === 'settle_flight_economy' ? [args.p_plan] : [args.p_plan, args.p_admin];
        return { data: (await dbCall(sql, values)).rows[0].r, error: null };
      } catch (error) { return { data: null, error: { message: error.message, code: error.code } }; }
    },
  };
  const closure = load('src/lib/plans-vol/closure.ts', { '@/lib/supabase/admin': {}, '@/lib/aeroports-ptfs': {}, '@/lib/compagnie-utils': {}, '@/lib/armee': {}, '@/lib/felitz/ensure-comptes': {} });
  let currentUser = actor;
  const api = load('src/app/api/plans-vol/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ from: admin.from, auth: { getUser: async () => ({ data: { user: { id: currentUser } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/plans-vol/closure': closure,
    '@/lib/plans-vol/crew': { isPlanCrew: (p, user) => p.pilote_id === user || p.copilote_id === user },
  });
  const call = (plan, action, user = actor) => { currentUser = user; return api.PATCH({ json: async () => ({ action }) }, { params: Promise.resolve({ id: plan.id }) }); };
  const query = async (sql, args = []) => (await dbCall(sql, args)).rows;
  const prepare = async ({ controlled = false, premature = false } = {}) => {
    const input = { request_id: id(100), compagnie_avion_id: aircraft, numero_vol: 'TEST12', aeroport_depart: 'IRFD', nature_transport: 'passagers', segments: [{ aeroport_arrivee: 'ILAR', type_vol: 'IFR', temps_prev_min: 18 }, { aeroport_arrivee: 'ITKO', type_vol: 'IFR', temps_prev_min: 20 }] };
    const it = (await query('SELECT create_company_itinerary($1,$2,$3) r', [actor, company, input]))[0].r;
    const leg = (await query('SELECT * FROM company_itinerary_legs WHERE itinerary_id=$1 ORDER BY leg_index', [it.id]))[0];
    const scope = { aeroport_depart: leg.origin, aeroport_arrivee: leg.destination, compagnie_id: company, compagnie_avion_id: aircraft, inventaire_avion_id: null, vol_commercial: true, vol_ferry: false, nature_transport: 'passagers' };
    const candidate = { nb_pax_genere: 50, cargo_kg_genere: 100, cargo_bonus_percent: 0, type_cargaison: 'general', prix_billet_reference: 100, prix_kg_reference: 2 };
    const quote = (await query('SELECT get_flight_submission_quote($1,$2,$3) r', [actor, scope, candidate]))[0].r;
    const payload = { ...scope, pilote_id: actor, numero_vol: 'TEST12', statut: 'accepte', temps_prev_min: 18, type_vol: 'IFR', heure_depart_estimee: new Date(Date.now() - 18 * 60000).toISOString(), accepted_at: new Date(Date.now() - (premature ? 0 : 18 * 60000)).toISOString(), automonitoring: !controlled, current_holder_user_id: controlled ? controller : null };
    const plan = (await query('SELECT submit_company_itinerary_leg($1,$2,$3,$4,$5) r', [actor, it.id, leg.id, payload, quote.quote_id]))[0].r;
    if (controlled) await query("UPDATE plans_vol SET statut='en_attente_cloture',demande_cloture_at=now() WHERE id=$1", [plan.id]);
    return { it, leg, plan, scope, candidate, quote, payload };
  };
  const state = async value => ({
    itinerary: (await query('SELECT status,next_leg_index FROM company_itineraries WHERE id=$1', [value.it.id]))[0],
    plan: (await query('SELECT statut FROM plans_vol WHERE id=$1', [value.plan.id]))[0],
    legs: await query('SELECT status FROM company_itinerary_legs WHERE itinerary_id=$1 ORDER BY leg_index', [value.it.id]),
    settlements: (await query('SELECT count(*)::int n FROM flight_economy_settlements'))[0].n,
    ledger: (await query('SELECT count(*)::int n FROM felitz_transactions'))[0].n,
    aircraft: (await query('SELECT aeroport_actuel,usure_percent FROM compagnie_avions WHERE id=$1', [aircraft]))[0],
  });
  const isolated = async fn => { await db.exec('BEGIN'); attempts.length = 0; try { await fn(); } finally { await db.exec('ROLLBACK'); } };
  try {
    for (const controlled of [false, true]) await t.test(`${controlled ? 'ATC confirmation' : 'pilot direct closure'} rolls back a downstream failure, remains resumable and retries exactly once`, () => isolated(async () => {
      const value = await prepare({ controlled }), before = await state(value);
      await query('UPDATE test_fail_review SET value=true');
      const failed = await call(value.plan, controlled ? 'confirmer_cloture' : 'cloture', controlled ? controller : actor);
      assert.equal(failed.status, 409); assert.deepEqual(await state(value), before);
      assert.equal(attempts.filter(a => a.table === 'plans_vol' && a.mutation.statut === 'cloture').length, 0);
      await query('UPDATE test_fail_review SET value=false');
      const success = await call(value.plan, controlled ? 'confirmer_cloture' : 'cloture', controlled ? controller : actor);
      assert.equal(success.status, 200);
      const settled = await state(value); assert.equal(settled.itinerary.status, 'paused'); assert.equal(settled.plan.statut, 'cloture'); assert.equal(settled.settlements, 1); assert.ok(settled.ledger > 0);
      await call(value.plan, controlled ? 'confirmer_cloture' : 'cloture', controlled ? controller : actor);
      assert.deepEqual(await state(value), settled);
    }));
    await t.test('premature pilot closure stays active and never advances, moves or pays a leg', () => isolated(async () => {
      const value = await prepare({ premature: true }), before = await state(value);
      const response = await call(value.plan, 'cloture'); assert.equal(response.status, 409); assert.match(response.body.error, /anormalement courte/);
      assert.deepEqual(await state(value), before);
    }));
    await t.test('ATC can retry after an invalid early request without shifting a valid request or advancing unpaid legs', () => isolated(async () => {
      const value = await prepare({ controlled: true });
      // Seed the state that exists 17 minutes after a premature pilot request;
      // explicit historical test time avoids waiting while preserving accepted_at.
      await db.exec('ALTER TABLE plans_vol DISABLE TRIGGER guard_flight_economy_snapshot');
      await query("UPDATE plans_vol SET demande_cloture_at=accepted_at+interval '1 minute' WHERE id=$1", [value.plan.id]);
      await db.exec('ALTER TABLE plans_vol ENABLE TRIGGER guard_flight_economy_snapshot');
      const before = await state(value);
      const first = await call(value.plan, 'confirmer_cloture', controller); assert.equal(first.status, 409);
      assert.deepEqual(await state(value), before);
      assert.equal((await query('SELECT demande_cloture_at FROM plans_vol WHERE id=$1', [value.plan.id]))[0].demande_cloture_at, null);
      assert.equal((await call(value.plan, 'confirmer_cloture', controller)).status, 200);
      assert.equal((await state(value)).itinerary.status, 'paused');
    }));
    await t.test('database rejects a terminal status transition without a durable settlement', () => isolated(async () => {
      const value = await prepare(), before = await state(value);
      await db.exec('SAVEPOINT forbidden_close');
      await assert.rejects(query("UPDATE plans_vol SET statut='cloture' WHERE id=$1", [value.plan.id]), /règlement atomique/);
      await db.exec('ROLLBACK TO SAVEPOINT forbidden_close;RELEASE SAVEPOINT forbidden_close');
      assert.deepEqual(await state(value), before);
    }));
    await t.test('old daily quote remains legacy for standard flights and cannot activate a connected leg', () => isolated(async () => {
      await query('UPDATE economy_release_settings SET enabled=false');
      // Build the itinerary first; only the quote version is a legacy contract.
      const value = await prepare().catch(error => error);
      assert.match(value.message, /devis économique version 2/);
      assert.equal((await query('SELECT count(*)::int n FROM plans_vol'))[0].n, 0);
      const stored = (await query('SELECT economy_snapshot FROM flight_submission_quotes'))[0]; assert.equal(stored.economy_snapshot, null);
      const itinerary = (await query('SELECT id FROM company_itineraries'))[0];
      const legacy = (await query('SELECT id,scope,draw FROM flight_submission_quotes'))[0];
      await query('SELECT cancel_company_itinerary($1,$2)', [actor, itinerary.id]);
      await query('UPDATE economy_release_settings SET enabled=true');
      const reused = (await query('SELECT get_flight_submission_quote($1,$2,$3) r', [actor, legacy.scope, legacy.draw]))[0].r;
      assert.equal(reused.quote_id, legacy.id); assert.equal(reused.economy_version, undefined);
      const plan = (await query('SELECT submit_flight_plan_integrity($1,$2,$3) r', [actor, { ...legacy.scope, pilote_id: actor, numero_vol: 'LEGACY', statut: 'en_attente', type_vol: 'IFR', temps_prev_min: 18 }, legacy.id]))[0].r;
      assert.equal((await query('SELECT economy_version FROM plans_vol WHERE id=$1', [plan.id]))[0].economy_version, 1);
    }));
    await t.test('administrator force closure keeps its one atomic settlement and separate fine', () => isolated(async () => {
      const value = await prepare(), response = await call(value.plan, 'cloture_forcee', id(4));
      assert.equal(response.status, 200); assert.equal(response.body.amende, 50000);
      const paid = await state(value); assert.equal(paid.settlements, 1); assert.equal(paid.itinerary.status, 'paused');
      await call(value.plan, 'cloture_forcee', id(4)); assert.deepEqual(await state(value), paid);
    }));
  } finally { await db.close(); }
});
