const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { setup, id, actor, copilot, controller, company, aircraft } = require('./fixtures/company-itinerary-economy.cjs');

test('commercial itineraries: authoritative legs, reservations and ordinary per-leg settlement', async t => {
  const db = await setup();
  await db.exec(`
    CREATE TABLE company_research_catalog(id text PRIMARY KEY,unlock_key text);
    CREATE TABLE company_research_projects(company_id uuid,research_id text,ready_at timestamptz);
    INSERT INTO company_research_catalog VALUES('RES-06','correspondance');
    CREATE OR REPLACE FUNCTION company_development_has_unlock(p_company uuid,p_key text,p_at timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM company_research_projects p JOIN company_research_catalog r ON r.id=p.research_id WHERE p.company_id=p_company AND r.unlock_key=p_key AND p.ready_at<=p_at)
    $$;
    UPDATE economy_release_settings SET enabled=true,activated_at=now();
  `);
  const sql = fs.readFileSync('supabase/company_itineraries_20261030.sql', 'utf8');
  await db.exec(sql); await db.exec(sql);
  const query = async (sql, args = []) => {
    await db.exec('SAVEPOINT call');
    try { const result = await db.query(sql, args); await db.exec('RELEASE SAVEPOINT call'); return result.rows; }
    catch (error) { await db.exec('ROLLBACK TO SAVEPOINT call; RELEASE SAVEPOINT call'); throw error; }
  };
  const scalar = async sql => (await query(sql))[0].n;
  const input = changes => ({ request_id: id(100), compagnie_avion_id: aircraft, numero_vol: 'TEST12', aeroport_depart: 'IRFD', nature_transport: 'passagers', segments: [
    { aeroport_arrivee: 'ILAR', type_vol: 'IFR', temps_prev_min: 18 },
    { aeroport_arrivee: 'ITKO', type_vol: 'VFR', temps_prev_min: 20 },
  ], ...changes });
  const create = async (body = input(), user = actor, comp = company) => (await query('SELECT create_company_itinerary($1,$2,$3) result', [user, comp, body]))[0].result;
  const legs = async itinerary => query('SELECT * FROM company_itinerary_legs WHERE itinerary_id=$1 ORDER BY leg_index', [itinerary.id]);
  const row = async itinerary => (await query('SELECT * FROM company_itineraries WHERE id=$1', [itinerary.id]))[0];
  const scope = leg => ({ aeroport_depart: leg.origin, aeroport_arrivee: leg.destination, compagnie_id: company, compagnie_avion_id: aircraft, inventaire_avion_id: null, vol_commercial: true, vol_ferry: false, nature_transport: 'passagers' });
  const draw = changes => ({ nb_pax_genere: 50, cargo_kg_genere: 100, cargo_bonus_percent: 0, type_cargaison: 'general', prix_billet_reference: 100, prix_kg_reference: 2, ...changes });
  const quote = async (leg, changes = {}) => (await query('SELECT get_flight_submission_quote($1,$2,$3) result', [actor, scope(leg), draw(changes)]))[0].result;
  const plan = (leg, changes = {}) => ({ ...scope(leg), pilote_id: actor, numero_vol: 'TEST12', statut: 'en_attente', temps_prev_min: leg.preparation?.temps_prev_min || 18, type_vol: 'IFR', heure_depart_estimee: new Date(Date.now() - 18 * 60000).toISOString(), ...changes });
  const submit = async (it, leg, q, changes = {}, user = actor) => (await query('SELECT submit_company_itinerary_leg($1,$2,$3,$4,$5) result', [user, it.id, leg.id, plan(leg, changes), q.quote_id]))[0].result;
  const cancel = async (it, user = actor) => (await query('SELECT cancel_company_itinerary($1,$2) result', [user, it.id]))[0].result;
  const ready = async p => query("UPDATE plans_vol SET statut='en_attente_cloture',accepted_at=now()-interval '18 minutes',demande_cloture_at=now() WHERE id=$1", [p.id]);
  const settle = async p => (await query('SELECT settle_flight_economy($1) result', [p.id]))[0].result;
  const isolated = async fn => { await db.exec('BEGIN'); try { await fn(); } finally { await db.exec('ROLLBACK'); } };
  const unlock = () => db.exec(`INSERT INTO company_research_projects VALUES('${company}','RES-06',now()-interval '1 second')`);
  try {
    await t.test('RES-06 must actually finish; a pending 15-hour project cannot create a route', () => isolated(async () => {
      await assert.rejects(create(), /Recherche.*requise/);
      await db.exec(`INSERT INTO company_research_projects VALUES('${company}','RES-06',now()+interval '15 hours')`);
      await assert.rejects(create(), /Recherche.*requise/);
      await db.exec(`UPDATE company_research_projects SET ready_at=now()`);
      assert.ok((await create()).id);
    }));
    await t.test('company membership, pilot role, route continuity and 2–5 limit are enforced in DB', () => isolated(async () => {
      await unlock();
      await assert.rejects(create(input(), controller), /Compte pilote/);
      await assert.rejects(create(input(), id(4)), /appartenez/);
      await assert.rejects(create(input({ segments: [input().segments[0]] })), /2 à 5/);
      await assert.rejects(create(input({ segments: Array.from({ length: 6 }, () => input().segments[0]) })), /2 à 5/);
      await assert.rejects(create(input({ segments: [{ ...input().segments[0], aeroport_depart: 'ITKO' }, input().segments[1]] })), /discontinu/);
      await assert.rejects(create(input({ aeroport_depart: 'ITKO' })), /position réelle/);
      assert.equal(await scalar('SELECT count(*)::int n FROM company_itineraries'), 0);
    }));
    await t.test('planning is idempotent and creates no plans, reserved stock or money', () => isolated(async () => {
      await unlock(); const it = await create();
      assert.equal((await create()).id, it.id);
      await assert.rejects(create(input({ numero_vol: 'OTHER' })), /déjà utilisé/);
      assert.equal((await legs(it)).length, 2);
      assert.equal(await scalar('SELECT count(*)::int n FROM plans_vol'), 0);
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), 0);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"), 10000);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='ILAR'"), 10000);
      assert.equal(await scalar('SELECT count(*)::int n FROM flight_submission_quotes'), 0);
    }));
    await t.test('reserved aircraft rejects ordinary submissions, forged links and a second route', () => isolated(async () => {
      await unlock(); const it = await create(), [first, second] = await legs(it), q = await quote(first);
      await assert.rejects(query('SELECT submit_flight_plan_integrity($1,$2,$3)', [actor, plan(first), q.quote_id]), /réservé/);
      await assert.rejects(create(input({ request_id: id(101) })), /unique constraint/);
      await assert.rejects(submit(it, second, q), /Clôturez/);
      await assert.rejects(submit(it, first, q, { aeroport_arrivee: 'ITKO' }), /incompatible/);
      await assert.rejects(submit(it, first, q, {}, copilot), /introuvable pour ce pilote/);
      assert.equal(await scalar('SELECT count(*)::int n FROM plans_vol'), 0);
      assert.equal((await legs(it))[0].plan_id, null);
    }));
    await t.test('each leg uses the ordinary frozen quote, salary, fuel and settlement exactly once', () => isolated(async () => {
      await unlock(); const it = await create(), [first, second] = await legs(it);
      const q1 = await quote(first), p1 = await submit(it, first, q1, { nb_pax_genere: 999999, salaire_pilote: 999999, revenue_brut: 999999 });
      assert.equal((await row(it)).status, 'active');
      assert.equal(await scalar('SELECT nb_pax_genere n FROM plans_vol'), 50);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"), 9950);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='ILAR'"), 10000);
      await assert.rejects(cancel(it), /plan actif/);
      await assert.rejects(submit(it, second, await quote(second)), /Clôturez/);
      await ready(p1); const s1 = await settle(p1);
      assert.equal((await row(it)).status, 'paused');
      assert.equal((await row(it)).next_leg_index, 2);
      assert.equal((await query('SELECT statut FROM plans_vol WHERE id=$1', [p1.id]))[0].statut, 'cloture');
      assert.equal((await query('SELECT aeroport_actuel FROM compagnie_avions'))[0].aeroport_actuel, 'ILAR');
      const balance = await scalar("SELECT solde n FROM felitz_comptes WHERE type='entreprise'");
      const count = await scalar('SELECT count(*)::int n FROM felitz_transactions');
      assert.equal((await submit(it, first, q1)).id, p1.id);
      assert.deepEqual(await settle(p1), s1);
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), count);
      assert.equal(await scalar("SELECT solde n FROM felitz_comptes WHERE type='entreprise'"), balance);
      await assert.rejects(query("UPDATE plans_vol SET statut='en_pause' WHERE id=$1", [p1.id]), /réglé et clôturé|ne peut pas être activé/);
      const q2 = await quote(second);
      assert.deepEqual(await quote(second, { nb_pax_genere: 99, cargo_kg_genere: 999, type_cargaison: 'marchandise_rare' }), q2);
      const p2 = await submit(it, second, q2);
      await ready(p2); const s2 = await settle(p2);
      assert.equal((await row(it)).status, 'completed');
      assert.equal(await scalar('SELECT count(*)::int n FROM flight_economy_settlements'), 2);
      assert.equal(await scalar("SELECT solde n FROM felitz_comptes WHERE type='entreprise'"), s1.company_net + s2.company_net);
      assert.equal(await scalar("SELECT solde n FROM felitz_comptes WHERE type='personnel'"), s1.salary_total + s2.salary_total);
      assert.equal(await scalar('SELECT usure_percent n FROM compagnie_avions'), 96);
      assert.equal((await legs(it))[0].status, 'completed');
      assert.equal((await legs(it))[1].status, 'completed');
      assert.equal((await submit(it, second, q2)).id, p2.id);
    }));
    await t.test('cancel remaining legs preserves the settled plan and releases the aircraft without a second payout', () => isolated(async () => {
      await unlock(); const it = await create(), [first] = await legs(it), p = await submit(it, first, await quote(first));
      await ready(p); await settle(p);
      const count = await scalar('SELECT count(*)::int n FROM felitz_transactions');
      await cancel(it); await cancel(it);
      assert.equal((await row(it)).status, 'cancelled');
      assert.equal((await legs(it))[0].status, 'completed');
      assert.equal((await legs(it))[1].status, 'cancelled');
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), count);
      assert.equal((await query('SELECT statut FROM plans_vol'))[0].statut, 'cloture');
      const next = { origin: 'ILAR', destination: 'ITKO' }, q = await quote(next);
      assert.ok((await query('SELECT submit_flight_plan_integrity($1,$2,$3) result', [actor, plan(next), q.quote_id]))[0].result.id);
    }));
    await t.test('diversion suspends the old route and re-planning begins at actual arrival', () => isolated(async () => {
      await unlock(); const it = await create(), [first, second] = await legs(it), p = await submit(it, first, await quote(first));
      await ready(p); await query("UPDATE plans_vol SET aeroport_arrivee='ITKO',deroutement_at=now() WHERE id=$1", [p.id]);
      const settlement = await settle(p);
      assert.equal(settlement.diverted, true);
      assert.equal((await row(it)).status, 'diverted');
      assert.equal((await legs(it))[0].actual_destination, 'ITKO');
      assert.equal((await legs(it))[1].origin, 'ILAR');
      await assert.rejects(submit(it, second, await quote(second)), /Clôturez/);
      await cancel(it);
      assert.ok((await create(input({ request_id: id(101), aeroport_depart: 'ITKO', segments: [{ aeroport_arrivee: 'ILAR', type_vol: 'IFR', temps_prev_min: 18 }, { aeroport_arrivee: 'IRFD', type_vol: 'IFR', temps_prev_min: 18 }] }))).id);
    }));
    await t.test('downstream settlement failure rolls back payouts, closure and itinerary advancement together', () => isolated(async () => {
      await unlock(); const it = await create(), [first] = await legs(it), p = await submit(it, first, await quote(first));
      await ready(p); await db.exec('UPDATE test_fail_review SET value=true');
      await assert.rejects(settle(p), /review failure/);
      assert.equal((await row(it)).status, 'active');
      assert.equal((await legs(it))[0].status, 'active');
      assert.equal(await scalar('SELECT count(*)::int n FROM flight_economy_settlements'), 0);
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), 0);
      assert.equal(await scalar('SELECT usure_percent n FROM compagnie_avions'), 100);
      await db.exec('UPDATE test_fail_review SET value=false'); await settle(p);
      assert.equal((await row(it)).status, 'paused');
    }));
    await t.test('planned route and settled links are immutable; ordinary existing plans remain isolated', () => isolated(async () => {
      await unlock(); const it = await create(), [first] = await legs(it), p = await submit(it, first, await quote(first));
      await assert.rejects(query("UPDATE company_itinerary_legs SET origin='ITKO' WHERE id=$1", [first.id]), /immuable/);
      await assert.rejects(query('UPDATE company_itineraries SET aircraft_id=$1 WHERE id=$2', [id(999), it.id]), /immuable/);
      await assert.rejects(query('UPDATE plans_vol SET company_itinerary_id=NULL WHERE id=$1', [p.id]), /immuable/);
      await query("UPDATE plans_vol SET statut='annule' WHERE id=$1", [p.id]);
      assert.equal((await row(it)).status, 'cancelled');
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"), 10000);
      await query("INSERT INTO plans_vol(pilote_id,statut,aeroport_depart,aeroport_arrivee) VALUES($1,'cloture','IRFD','ILAR')", [copilot]);
      assert.equal(await scalar('SELECT count(*)::int n FROM company_itineraries'), 1);
    }));
    await t.test('unused and cancelled histories detach deleted entities without blocking disposal or losing identities', async () => {
      for (const [table, field, entity] of [['profiles', 'pilot_id', actor], ['compagnie_avions', 'aircraft_id', aircraft], ['compagnies', 'company_id', company]]) {
        await isolated(async () => {
          await unlock(); const it = await create();
          if (table !== 'profiles') await cancel(it);
          await assert.rejects(query(`UPDATE company_itineraries SET ${field}=NULL WHERE id=$1`, [it.id]), /immuable/);
          // Isolate the new itinerary references from the existing tariff FK.
          if (table === 'compagnies') await query('DELETE FROM flight_economy_tariff_reference WHERE company_id=$1', [entity]);
          await query(`DELETE FROM ${table} WHERE id=$1`, [entity]);
          const archived = await row(it);
          assert.equal(archived[field], null); assert.equal(archived.identity_snapshot[field], entity);
          assert.equal(archived.status, 'cancelled'); assert.ok(archived.archived_at);
          assert.deepEqual((await legs(it)).map(leg => leg.status), ['cancelled', 'cancelled']);
          assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), 0);
          await assert.rejects(query("UPDATE company_itineraries SET identity_snapshot='{}' WHERE id=$1", [it.id]), /immuable/);
        });
      }
    });
    await t.test('deleting an unpaid cancelled plan retains the leg and its original plan UUID', () => isolated(async () => {
      await unlock(); const it = await create(), [first] = await legs(it), p = await submit(it, first, await quote(first));
      await query("UPDATE plans_vol SET statut='annule' WHERE id=$1", [p.id]);
      assert.equal((await legs(it))[0].original_plan_id, p.id);
      await assert.rejects(query('UPDATE company_itinerary_legs SET plan_id=NULL WHERE id=$1', [first.id]), /immuable/);
      await query('DELETE FROM plans_vol WHERE id=$1', [p.id]);
      const historical = (await legs(it))[0];
      assert.equal(historical.plan_id, null); assert.equal(historical.original_plan_id, p.id); assert.equal(historical.status, 'cancelled');
      assert.equal(await scalar('SELECT count(*)::int n FROM company_itinerary_legs'), 2);
    }));
    await t.test('account deletion preflight rejects active and paid histories before creating a cleanup marker', () => isolated(async () => {
      await unlock(); const it = await create(), [first] = await legs(it), p = await submit(it, first, await quote(first));
      const prepare = () => query('SELECT prepare_company_itinerary_account_deletion($1,$2)', [actor, id(200)]);
      await assert.rejects(prepare(), /historique de vol/);
      await assert.rejects(query('DELETE FROM plans_vol WHERE id=$1', [p.id]), /historique financier/);
      assert.equal(await scalar('SELECT count(*)::int n FROM company_itinerary_account_deletions'), 0);
      await ready(p); await settle(p);
      const count = await scalar('SELECT count(*)::int n FROM felitz_transactions');
      await assert.rejects(prepare(), /historique de vol/);
      await assert.rejects(query('DELETE FROM plans_vol WHERE id=$1', [p.id]), /historique financier/);
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), count);
      assert.equal(await scalar('SELECT count(*)::int n FROM flight_economy_settlements'), 1);
      assert.equal((await row(it)).status, 'paused');
    }));
    await t.test('deletion marker freezes new submissions across the cleanup gap and disappears with the unused pilot', () => isolated(async () => {
      await unlock(); const it = await create(), [first] = await legs(it), q = await quote(first);
      await query('SELECT prepare_company_itinerary_account_deletion($1,$2)', [actor, id(200)]);
      await assert.rejects(query('SELECT prepare_company_itinerary_account_deletion($1,$2)', [actor, id(201)]), /déjà en cours/);
      await assert.rejects(create(input({ request_id: id(101) })), /Suppression du compte/);
      await assert.rejects(submit(it, first, q), /Suppression du compte/);
      await assert.rejects(query("INSERT INTO plans_vol(pilote_id,statut) VALUES($1,'en_attente')", [actor]), /Suppression du compte/);
      await query('DELETE FROM profiles WHERE id=$1', [actor]);
      assert.equal((await row(it)).pilot_id, null); assert.equal((await row(it)).identity_snapshot.pilot_id, actor);
      assert.equal((await row(it)).status, 'cancelled');
      assert.equal(await scalar('SELECT count(*)::int n FROM company_itinerary_account_deletions'), 0);
    }));
    await t.test('ferry insertion and every activation/completion transition share the aircraft reservation guard', () => isolated(async () => {
      await unlock(); const it = await create();
      for (const status of ['planned', 'in_progress', 'completed']) await assert.rejects(query('INSERT INTO vols_ferry(avion_id,statut) VALUES($1,$2)', [aircraft, status]), /réservé/);
      await query("INSERT INTO vols_ferry(avion_id,statut) VALUES($1,'cancelled')", [aircraft]);
      for (const status of ['planned', 'in_progress', 'completed']) await assert.rejects(query('UPDATE vols_ferry SET statut=$1 WHERE avion_id=$2', [status, aircraft]), /réservé/);
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'), 0);
      const [first] = await legs(it), p = await submit(it, first, await quote(first)); await ready(p); await settle(p);
      await assert.rejects(query("INSERT INTO vols_ferry(avion_id,statut) VALUES($1,'planned')", [aircraft]), /réservé/);
      await cancel(it);
      await query("UPDATE vols_ferry SET statut='planned' WHERE avion_id=$1", [aircraft]);
      await assert.rejects(create(input({ request_id: id(101), aeroport_depart: 'ILAR', segments: [{ aeroport_arrivee: 'ITKO', type_vol: 'IFR', temps_prev_min: 18 }, { aeroport_arrivee: 'IRFD', type_vol: 'IFR', temps_prev_min: 18 }] })), /réparation ou transfert/);
    }));
    await t.test('authenticated clients cannot call mutations or read and forge itinerary records', () => isolated(async () => {
      await unlock(); const it = await create();
      await db.exec('SET LOCAL ROLE authenticated');
      await assert.rejects(create(), /permission denied/);
      await assert.rejects(cancel(it), /permission denied/);
      await assert.rejects(query('SELECT * FROM company_itineraries'), /permission denied/);
      await assert.rejects(query("UPDATE company_itinerary_legs SET status='completed'"), /permission denied/);
      await db.exec('RESET ROLE');
    }));
  } finally { await db.close(); }
});
