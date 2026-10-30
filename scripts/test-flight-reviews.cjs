const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `${String(n).padStart(8, '0')}-5555-4555-8555-555555555555`;
const baseline = fs.readFileSync('supabase/flight_reviews_20261030.sql', 'utf8');
const batchSql = fs.readFileSync('supabase/company_flight_review_batches_20261030.sql', 'utf8');
async function setup({ batches = true } = {}) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE profiles(id uuid PRIMARY KEY,role text);INSERT INTO profiles VALUES('${id(100)}','admin'),('${id(101)}','pilote');
    CREATE TABLE compagnies(id uuid PRIMARY KEY,nom text);
    CREATE TABLE plans_vol(id uuid PRIMARY KEY,compagnie_id uuid,vol_commercial boolean,statut text,cloture_at timestamptz,aeroport_arrivee text,economy_version integer NOT NULL DEFAULT 2,nb_pax_genere integer DEFAULT 100,cargo_kg_genere numeric DEFAULT 0,nature_transport text DEFAULT 'passagers',accepted_at timestamptz,heure_depart_estimee timestamptz,temps_prev_min integer DEFAULT 18,deroutement_at timestamptz);
    CREATE TABLE flight_economy_settlements(plan_id uuid PRIMARY KEY,detail jsonb);
    CREATE TABLE economy_release_settings(id boolean,enabled boolean);INSERT INTO economy_release_settings VALUES(true,true);
    INSERT INTO compagnies VALUES('${id(1)}','Lufthansa'),('${id(2)}','Air Tahiti Nui');`);
  await db.exec(baseline); await db.exec(baseline);
  if (batches) { await db.exec(batchSql); await db.exec(batchSql); }
  return db;
}
async function flight(db, n, { company = 1, delay = 0, settled = true, closed = true, wifi = false, diverted = false, completed = new Date().toISOString(), pax = 100, kg = 0, nature = 'passagers', version = 2 } = {}) {
  await db.query("INSERT INTO plans_vol(id,compagnie_id,vol_commercial,statut,cloture_at,aeroport_arrivee,economy_version,nb_pax_genere,cargo_kg_genere,nature_transport,accepted_at,heure_depart_estimee,temps_prev_min) VALUES($1,$2,true,$3,$4,'IRFD',$5,$6,$7,$8,$4::timestamptz-interval '18 minutes',$4::timestamptz-interval '18 minutes',18)", [id(n), id(company), closed ? 'cloture' : 'en_cours', completed, version, pax, kg, nature]);
  if (settled) await db.query('INSERT INTO flight_economy_settlements VALUES($1,$2)', [id(n), { delay_minutes: delay, wifi_enabled: wifi, wifi_price: 0, ife_level: 1, diverted }]);
  await db.query('SELECT publish_flight_review($1)', [id(n)]);
  return (await db.query('SELECT * FROM plans_vol WHERE id=$1', [id(n)])).rows[0];
}
const reviews = async (db, n) => (await db.query('SELECT * FROM flight_reviews WHERE plan_id=$1 ORDER BY review_sequence', [id(n)])).rows;
const legacy = async (db, n, user = 100) => (await db.query('SELECT publish_legacy_flight_reviews($1,$2) r', [id(user), id(n)])).rows[0].r;

test('public reviews form one distinct 3..30 batch per settled closed flight, with the old exact reputation impact', async () => {
  const db = await setup(); try {
    await flight(db, 10, { settled: false }); await flight(db, 11, { closed: false }); const p = await flight(db, 12, { wifi: true });
    const first = await reviews(db, 12); assert.ok(first.length >= 3 && first.length <= 30); assert.equal(first.length, p.review_generated_count);
    assert.equal(new Set(first.map(r => r.body)).size, first.length); assert.equal(new Set(first.map(r => r.author_label)).size, first.length);
    assert.ok(first.every(r => /Lufthansa/.test(r.body) && /Wi-Fi gratuit/.test(r.body) && r.rating === 5 && r.simulation));
    assert.equal(Number((await db.query('SELECT sum(demand_percent) n FROM flight_reviews WHERE plan_id=$1', [id(12)])).rows[0].n), .25);
    await db.query('SELECT publish_flight_review($1)', [id(12)]); assert.deepEqual(await reviews(db, 12), first);
    await db.exec('UPDATE economy_release_settings SET enabled=false'); await flight(db, 13); assert.equal((await db.query('SELECT count(*)::int n FROM flight_reviews')).rows[0].n, first.length);
  } finally { await db.close(); }
});
test('load weighting is increasing at the same random draw, bounded, varies draws and distinguishes pax from cargo kg', async () => {
  const db = await setup(); try {
    const size = async (pax, kg, type, roll) => (await db.query('SELECT flight_review_batch_size($1,$2,$3,$4) n', [pax, kg, type, roll])).rows[0].n;
    assert.equal(await size(0, 0, 'passagers', .9), 0); assert.equal(await size(1, 0, 'passagers', 0), 3); assert.equal(await size(400, 0, 'passagers', 1), 30); assert.equal(await size(0, 100000, 'cargo', 1), 30);
    for (const roll of [0, .5, 1]) {
      const pax = await Promise.all([1, 10, 50, 100, 200, 400, 800].map(n => size(n, 0, 'passagers', roll)));
      const cargo = await Promise.all([1, 100, 1000, 10000, 100000, 200000].map(n => size(0, n, 'cargo', roll)));
      for (const values of [pax, cargo]) { assert.deepEqual(values, [...values].sort((a, b) => a - b)); assert.ok(values.every(n => n >= 3 && n <= 30)); }
    }
    assert.ok(await size(100, 0, 'passagers', .5) > await size(0, 100, 'cargo', .5));
    assert.notEqual(await size(400, 0, 'passagers', 0), await size(400, 0, 'passagers', 1));
  } finally { await db.close(); }
});
test('a complete 30-voice cargo batch has distinct bodies and authors without invented cabin incidents', async () => {
  const db = await setup(); try {
    let seed;
    for (let i = 0; i <= 1000; i++) { const value = i / 500 - 1; await db.query('SELECT setseed($1)', [value]); if ((await db.query('SELECT random() r')).rows[0].r > .97) { seed = value; break; } }
    assert.notEqual(seed, undefined); await db.query('SELECT setseed($1)', [seed]);
    await flight(db, 20, { pax: 0, kg: 100000, nature: 'cargo', wifi: true, delay: 75, diverted: true });
    const rows = await reviews(db, 20); assert.equal(rows.length, 30); assert.equal(new Set(rows.map(r => r.body)).size, 30); assert.equal(new Set(rows.map(r => r.author_label)).size, 30);
    assert.ok(rows.every(r => /75 minutes/.test(r.body) && /déroutement/.test(r.body) && /Client fret virtuel/.test(r.author_label)));
    assert.ok(rows.every(r => !/Wi-Fi|divertissements|repas|correspondance|bagages perdus/.test(r.body)));
    assert.equal(Number((await db.query('SELECT sum(demand_percent) n FROM flight_reviews')).rows[0].n), -2);
  } finally { await db.close(); }
});
test('batch reputation fades per flight, remains company-specific and respects the former caps', async () => {
  const db = await setup(); try {
    await flight(db, 20, { delay: 75, completed: '2026-10-20T12:00:00Z' }); await flight(db, 21, { company: 2, completed: '2026-10-20T12:00:00Z' });
    const rep = async (company, date) => Number((await db.query('SELECT flight_review_reputation($1,$2) n', [id(company), date])).rows[0].n);
    assert.equal(await rep(1, '2026-10-20T12:00:00Z'), -2); assert.equal(await rep(1, '2026-10-27T12:00:00Z'), -1); assert.equal(await rep(1, '2026-11-03T12:00:00Z'), 0); assert.equal(await rep(2, '2026-10-20T12:00:00Z'), .25);
    for (let n = 30; n < 40; n++) await flight(db, n, { delay: 90, completed: '2026-10-20T12:00:00Z' }); assert.equal(await rep(1, '2026-10-20T12:00:00Z'), -8);
  } finally { await db.close(); }
});
test('zero-load flights are processed once without inventing reviews and their marker cannot be reset', async () => {
  const db = await setup(); try {
    const p = await flight(db, 50, { pax: 0, kg: 0 }); assert.equal(p.review_generated_count, 0); assert.ok(p.review_generated_at); assert.equal((await reviews(db, 50)).length, 0);
    await db.query('UPDATE plans_vol SET nb_pax_genere=400 WHERE id=$1', [id(50)]); await db.query('SELECT publish_flight_review($1)', [id(50)]); assert.equal((await reviews(db, 50)).length, 0);
    await assert.rejects(db.query('UPDATE plans_vol SET review_generated_count=NULL,review_generated_at=NULL WHERE id=$1', [id(50)]), /immuable/);
  } finally { await db.close(); }
});
test('explicit legacy publication preserves the first review, has zero reputation impact and no economic settlement', async () => {
  const db = await setup(); try {
    await flight(db, 60, { version: 1, settled: false }); assert.equal((await reviews(db, 60)).length, 0);
    const original = (await db.query("INSERT INTO flight_reviews(plan_id,company_id,body,sentiment,rating,demand_percent) VALUES($1,$2,'Avis historique conservé','positif',5,0) RETURNING *", [id(60), id(1)])).rows[0];
    await assert.rejects(legacy(db, 60, 101), /administrateurs/);
    const result = await legacy(db, 60); assert.ok(result.generated_count >= 3 && result.generated_count <= 30); assert.equal(result.created_count, result.generated_count - 1);
    const rows = await reviews(db, 60); assert.deepEqual(rows.find(r => r.id === original.id), original); assert.equal(new Set(rows.map(r => r.body)).size, rows.length); assert.ok(rows.every(r => Number(r.demand_percent) === 0));
    assert.equal((await db.query('SELECT count(*)::int n FROM flight_economy_settlements')).rows[0].n, 0);
    const replay = await legacy(db, 60); assert.equal(replay.replayed, true); assert.equal(replay.created_count, 0); assert.deepEqual(await reviews(db, 60), rows);
    await flight(db, 61, { version: 1, settled: false, closed: false }); await assert.rejects(legacy(db, 61), /clôturé requis/);
    await flight(db, 62, { version: 1, settled: false }); await db.query('UPDATE plans_vol SET accepted_at=cloture_at+interval \'1 hour\' WHERE id=$1', [id(62)]); await assert.rejects(legacy(db, 62), /Horaires historiques/);
  } finally { await db.close(); }
});
test('global retention keeps only the newest 500 across companies and pruning never enables regeneration', async () => {
  const db = await setup(); try {
    await flight(db, 70, { version: 1, settled: false, completed: '2026-10-01T12:00:00Z' }); const old = await legacy(db, 70);
    for (let i = 0; i < 90; i++) await flight(db, 1000 + i, { company: i % 2 + 1, pax: 400, completed: new Date(Date.UTC(2026, 9, 20, 12, i)).toISOString() });
    assert.equal((await db.query('SELECT count(*)::int n FROM flight_reviews')).rows[0].n, 500);
    assert.equal((await db.query('SELECT count(DISTINCT company_id)::int n FROM flight_reviews')).rows[0].n, 2); assert.equal((await reviews(db, 70)).length, 0);
    const replay = await legacy(db, 70); assert.equal(replay.replayed, true); assert.equal(replay.generated_count, old.generated_count); assert.equal(replay.retained_count, 0);
    await db.query('SELECT publish_flight_review($1)', [id(1000)]); assert.equal((await db.query('SELECT count(*)::int n FROM flight_reviews')).rows[0].n, 500);
    assert.equal((await reviews(db, 1000)).length, 0);
  } finally { await db.close(); }
});
test('existing v2 singleton is adopted without updating original plan timestamps, and never regenerated after pruning', async () => {
  const db = await setup({ batches: false }); try {
    await flight(db, 80); const before = (await db.query('SELECT to_jsonb(p) r FROM plans_vol p WHERE id=$1', [id(80)])).rows[0].r;
    await db.exec(batchSql); await db.exec(batchSql);
    const after = (await db.query("SELECT to_jsonb(p)-'review_generated_count'-'review_generated_at' r FROM plans_vol p WHERE id=$1", [id(80)])).rows[0].r; assert.deepEqual(after, before);
    const adopted = (await db.query('SELECT * FROM flight_review_batch_adoptions WHERE plan_id=$1', [id(80)])).rows[0]; assert.equal(adopted.generated_count, 1);
    await db.query('DELETE FROM flight_reviews WHERE plan_id=$1', [id(80)]); await db.query('SELECT publish_flight_review($1)', [id(80)]); assert.equal((await reviews(db, 80)).length, 0);
    await assert.rejects(db.query('DELETE FROM flight_review_batch_adoptions WHERE plan_id=$1', [id(80)]), /immuable/);
  } finally { await db.close(); }
});
test('anonymous visitors retain safe feed fields and cannot identify source plans or invoke either publisher', async () => {
  const db = await setup(); try {
    await flight(db, 90); await db.exec('SET ROLE anon'); assert.ok((await db.query('SELECT body FROM flight_reviews')).rows.length >= 3);
    for (const statement of ['SELECT plan_id,company_id,demand_percent,review_sequence FROM flight_reviews', `SELECT publish_flight_review('${id(90)}')`, `SELECT publish_legacy_flight_reviews('${id(100)}','${id(90)}')`, 'DELETE FROM flight_reviews']) await assert.rejects(db.query(statement), /permission denied/);
  } finally { await db.close(); }
});
