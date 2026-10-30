const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { setup, id, actor, company, aircraft } = require('./fixtures/company-itinerary-economy.cjs');
test('ground requests share the flight terminal transaction and completion lock order', async t => {
  const db = await setup();
  await db.exec(`CREATE TABLE ground_service_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_vol_id uuid NOT NULL REFERENCES plans_vol(id),pilote_id uuid NOT NULL REFERENCES profiles(id),statut text NOT NULL DEFAULT 'pending',completed_at timestamptz,completed_by uuid,score_minijeu numeric,montant_paye numeric,notes text,pilote_confirme boolean DEFAULT false); UPDATE economy_release_settings SET enabled=true;`);
  const sql = fs.readFileSync('supabase/company_flight_ground_cleanup_20261030.sql', 'utf8'); await db.exec(sql); await db.exec(sql);
  const query = async (sql, args = []) => { await db.exec('SAVEPOINT statement'); try { const result = await db.query(sql, args); await db.exec('RELEASE SAVEPOINT statement'); return result.rows; } catch (e) { await db.exec('ROLLBACK TO SAVEPOINT statement;RELEASE SAVEPOINT statement'); throw e; } };
  const isolated = async fn => { await db.exec('BEGIN'); try { await fn(); } finally { await db.exec('ROLLBACK'); } };
  const prepare = async () => {
    const scope = { aeroport_depart: 'IRFD', aeroport_arrivee: 'ILAR', compagnie_id: company, compagnie_avion_id: aircraft, inventaire_avion_id: null, vol_commercial: true, vol_ferry: false, nature_transport: 'passagers' };
    const draw = { nb_pax_genere: 50, cargo_kg_genere: 100, cargo_bonus_percent: 0, type_cargaison: 'general', prix_billet_reference: 100, prix_kg_reference: 2 };
    const q = (await query('SELECT get_flight_submission_quote($1,$2,$3) r', [actor, scope, draw]))[0].r;
    return (await query('SELECT submit_flight_plan_integrity($1,$2,$3) r', [actor, { ...scope, pilote_id: actor, numero_vol: 'GROUND', statut: 'accepte', type_vol: 'IFR', temps_prev_min: 18, accepted_at: new Date(Date.now() - 18 * 60000).toISOString() }, q.quote_id]))[0].r;
  };
  const request = async (p, status = 'accepted') => (await query('INSERT INTO ground_service_requests(plan_vol_id,pilote_id,statut) VALUES($1,$2,$3) RETURNING *', [p.id, actor, status]))[0];
  const complete = (r, expected = r.statut) => query('SELECT complete_flight_ground_service($1,$2,$3,$4) r', [id(4), r.id, expected, { statut: 'completed', score_minijeu: 1, montant_paye: 123 }]);
  const statuses = async () => (await query('SELECT statut FROM ground_service_requests ORDER BY statut')).map(r => r.statut);
  try {
    await t.test('durable version 2 closure rejects pending services and retains completed ones', () => isolated(async () => {
      const p = await prepare(); for (const status of ['pending', 'accepted', 'in_progress', 'completed']) await request(p, status);
      await query('SELECT settle_flight_economy($1)', [p.id]); assert.deepEqual(await statuses(), ['completed', 'rejected', 'rejected', 'rejected']);
      assert.equal((await query('SELECT count(*)::int n FROM flight_economy_settlements'))[0].n, 1);
    }));
    await t.test('downstream settlement failure restores both ground work and every financial mutation', () => isolated(async () => {
      const p = await prepare(); await request(p); await query('UPDATE test_fail_review SET value=true');
      await assert.rejects(query('SELECT settle_flight_economy($1)', [p.id]), /review failure/);
      assert.deepEqual(await statuses(), ['accepted']); assert.equal((await query('SELECT count(*)::int n FROM felitz_transactions'))[0].n, 0);
      assert.equal((await query('SELECT statut FROM plans_vol WHERE id=$1', [p.id]))[0].statut, 'accepte');
    }));
    await t.test('legacy API payment failure restores the plan without cancelling its ground work', () => isolated(async () => {
      await query('UPDATE economy_release_settings SET enabled=false');
      const p = await prepare(); for (const status of ['pending', 'accepted', 'in_progress', 'completed']) await request(p, status);
      const before = await statuses(), writes = [];
      assert.equal((await query('SELECT economy_version FROM plans_vol WHERE id=$1', [p.id]))[0].economy_version, 1);
      const admin = { from(table) {
        let update, filters = [];
        const run = async single => {
          try {
            const values = [], bind = value => { values.push(value); return '$' + values.length; };
            let statement = update ? `UPDATE ${table} SET ${Object.entries(update).map(([key, value]) => `${key}=${bind(value)}`).join(',')}` : `SELECT * FROM ${table}`;
            if (filters.length) statement += ' WHERE ' + filters.map(([key, value, list]) => list ? `${key}=ANY(${bind(value)})` : `${key}=${bind(value)}`).join(' AND ');
            if (update) { statement += ' RETURNING *'; writes.push(update); }
            const rows = await query(statement, values); return { data: single ? rows[0] || null : rows, error: null };
          } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
        };
        const q = { select() { return q; }, eq(key, value) { filters.push([key, value, false]); return q; }, in(key, value) { filters.push([key, value, true]); return q; }, update(value) { update = value; return q; }, single: () => run(true), maybeSingle: () => run(true), then(resolve, reject) { return run(false).then(resolve, reject); } }; return q;
      } };
      let failedPayment = 0;
      const deps = {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/lib/supabase/server': { createClient: async () => ({ from: admin.from, auth: { getUser: async () => ({ data: { user: { id: actor } } }) } }) },
        '@/lib/supabase/admin': { createAdminClient: () => admin },
        '@/lib/plans-vol/crew': { isPlanCrew: (plan, user) => plan.pilote_id === user },
        '@/lib/plans-vol/closure': { envoyerChequesVol: async () => { failedPayment++; assert.deepEqual(await statuses(), before, 'Provisional legacy closure must not cancel ground work'); return { success: false, message: 'Paiement legacy rejeté pour ce test' }; } },
      };
      const m = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/app/api/plans-vol/[id]/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => deps[name] || {}, m, m.exports);
      const response = await m.exports.PATCH({ json: async () => ({ action: 'cloture' }) }, { params: Promise.resolve({ id: p.id }) });
      assert.equal(response.status, 400); assert.equal(failedPayment, 1); assert.deepEqual(writes.map(w => w.statut), ['cloture', 'accepte']);
      assert.equal((await query('SELECT statut FROM plans_vol WHERE id=$1', [p.id]))[0].statut, 'accepte');
      assert.deepEqual(await statuses(), before); assert.equal((await query('SELECT count(*)::int n FROM felitz_transactions'))[0].n, 0);
      await query("UPDATE plans_vol SET statut='en_pause' WHERE id=$1", [p.id]); assert.deepEqual(await statuses(), before);
      await query("UPDATE plans_vol SET statut='annule' WHERE id=$1", [p.id]); assert.deepEqual(await statuses(), ['completed', 'rejected', 'rejected', 'rejected']);
    }));
    await t.test('completion committed first is preserved; closure committed first blocks completion and new work', () => isolated(async () => {
      const p = await prepare(), first = await request(p), second = await request(p);
      assert.equal((await complete(first))[0].r.statut, 'completed');
      assert.equal((await complete(first))[0].r, null);
      await query('SELECT settle_flight_economy($1)', [p.id]);
      await assert.rejects(complete(second), /vol vient de se terminer/);
      await assert.rejects(request(p, 'pending'), /vol est terminé/);
      await assert.rejects(query("UPDATE ground_service_requests SET statut='completed' WHERE id=$1", [second.id]), /vol est terminé/);
      assert.deepEqual(await statuses(), ['completed', 'rejected']);
    }));
    await t.test('service completion RPC is inaccessible to authenticated clients', () => isolated(async () => {
      const p = await prepare(), r = await request(p); await db.exec('SET LOCAL ROLE authenticated');
      await assert.rejects(complete(r), /permission denied/); await db.exec('RESET ROLE');
    }));
  } finally { await db.close(); }
});

function apiFixture(error, noMatch = false) {
  let emitted = 0, directCompletions = 0, rpcCalls = 0;
  const row = { id: 'request', plan_vol_id: 'plan', pilote_id: 'pilot', statut: 'accepted', team_id: null, service_type: 'fuel', aeroport: 'IRFD', accepted_by: 'ground' };
  const admin = { from(table) { const q = { select() { return q; }, eq() { return q; }, is() { return q; }, single: async () => ({ data: table === 'profiles' ? { role: 'admin' } : row }), maybeSingle: async () => ({ data: { numero_vol: 'GROUND' } }), update(value) { if (value.statut === 'completed') directCompletions++; return q; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } }; return q; }, rpc: async (name, args) => { assert.equal(name, 'complete_flight_ground_service'); assert.equal(args.p_expected, 'accepted'); rpcCalls++; return { data: error || noMatch ? null : { ...row, statut: 'completed', score_minijeu: 1, montant_paye: 123 }, error }; } };
  const deps = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'ground' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/ground/pricing': { calculerPaiementService: () => 123 },
    '@/lib/ground/cheques': { emettreChequesServiceGround: async () => { emitted++; } },
    '@/lib/ground/teams': {}, '@/lib/ground/service-workflow': { canTransitionGroundService: () => true },
  };
  const m = { exports: {} }; new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/app/api/ground/service-requests/[id]/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => deps[name] || {}, m, m.exports);
  return { run: () => m.exports.PATCH({ json: async () => ({ statut: 'completed', score_minijeu: 1 }) }, { params: Promise.resolve({ id: 'request' }) }), emitted: () => emitted, directCompletions: () => directCompletions, rpcCalls: () => rpcCalls };
}
test('ground API emits no cheque if closure wins the completion race or request changed', async () => {
  for (const f of [apiFixture({ code: '23514', message: 'Le vol vient de se terminer' }), apiFixture(null, true)]) {
    assert.equal((await f.run()).status, 409); assert.equal(f.emitted(), 0); assert.equal(f.directCompletions(), 0); assert.equal(f.rpcCalls(), 1);
  }
});
test('ground API fails closed without the new RPC, and pays only after its successful commit', async () => {
  const missing = apiFixture({ code: 'PGRST202', message: 'Missing function' }); assert.equal((await missing.run()).status, 503); assert.equal(missing.emitted(), 0);
  const success = apiFixture(null); assert.equal((await success.run()).status, 200); assert.equal(success.emitted(), 1); assert.equal(success.directCompletions(), 0);
});
