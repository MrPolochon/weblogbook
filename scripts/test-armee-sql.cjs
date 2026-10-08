// Installer l'outil de test isolé : npm install --prefix tmp/armee-sql-tests --no-save --package-lock=false @electric-sql/pglite
const { PGlite } = require('../tmp/armee-sql-tests/node_modules/@electric-sql/pglite');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ids = { pilot: '11111111-1111-4111-8111-111111111111', chief: '22222222-2222-4222-8222-222222222222', civil: '33333333-3333-4333-8333-333333333333', aircraft: '44444444-4444-4444-8444-444444444444', type: '55555555-5555-4555-8555-555555555555', account: '66666666-6666-4666-8666-666666666666' };
async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid primary key, role text, armee boolean, blocked_until timestamptz, identifiant text default 'Pilote');
    CREATE TABLE types_avion(id uuid primary key, nom text, est_militaire boolean);
    CREATE TABLE armee_avions(id uuid primary key, type_avion_id uuid references types_avion(id), nom_personnalise text, detruit boolean default false);
    CREATE TABLE felitz_comptes(id uuid primary key, type text, proprietaire_id uuid, solde bigint default 0);
    CREATE TABLE felitz_transactions(id uuid default gen_random_uuid(), compte_id uuid references felitz_comptes(id), type text, montant bigint, libelle text);
    CREATE TABLE vols(
      id uuid primary key default gen_random_uuid(), pilote_id uuid references profiles(id) on delete cascade, copilote_id uuid references profiles(id) on delete set null, copilote_confirme_par_pilote boolean,
      compagnie_libelle text, type_avion_militaire text, armee_avion_id uuid references armee_avions(id), mission_id text, mission_titre text,
      mission_reward_base integer, mission_status text, mission_refusals integer default 0, mission_reward_final integer, mission_delay_minutes integer,
      mission_streak_days integer, mission_streak_bonus integer, escadrille_ou_escadron text, chef_escadron_id uuid references profiles(id), nature_vol_militaire text,
      nature_vol_militaire_autre text, aeroport_depart text, aeroport_arrivee text, duree_minutes integer, depart_utc timestamptz, arrivee_utc timestamptz,
      type_vol text, commandant_bord text, role_pilote text, callsign text, statut text, refusal_count integer default 0, refusal_reason text,
      editing_by_pilot_id uuid, editing_started_at timestamptz, created_by_admin boolean, created_at timestamptz default now()
    );
    CREATE TABLE vols_equipage_militaire(vol_id uuid references vols(id) on delete cascade, profile_id uuid references profiles(id) on delete cascade, primary key(vol_id, profile_id));
    CREATE TABLE armee_missions_log(id uuid primary key default gen_random_uuid(), mission_id text, user_id uuid references profiles(id) on delete cascade, reward integer, streak_bonus integer default 0, created_at timestamptz default now());
    CREATE TABLE armee_briefing(id smallint primary key, titre text, contenu text, actif boolean, updated_by uuid, updated_at timestamptz);
    INSERT INTO profiles(id, role, armee, blocked_until) VALUES ('${ids.pilot}', 'pilote', true, null), ('${ids.chief}', 'admin', true, null), ('${ids.civil}', 'pilote', false, null);
    INSERT INTO types_avion VALUES ('${ids.type}', 'F-16', true);
    INSERT INTO armee_avions(id, type_avion_id) VALUES ('${ids.aircraft}', '${ids.type}');
    INSERT INTO felitz_comptes VALUES ('${ids.account}', 'militaire', '${ids.chief}', 0);
  `);
  await db.exec(fs.readFileSync('supabase/secure_armee_operations.sql', 'utf8'));
  return db;
}
function row() { return { pilote_id: ids.pilot, armee_avion_id: ids.aircraft, mission_id: 'patrouille-frontiere', mission_titre: 'Patrouille', mission_reward_base: 20000, mission_status: 'en_attente', escadrille_ou_escadron: 'escadrille', nature_vol_militaire: 'reconnaissance', aeroport_depart: 'IMLR', aeroport_arrivee: 'IRFD', duree_minutes: 35, depart_utc: new Date(Date.now() - 36 * 60_000).toISOString(), type_vol: 'Vol militaire', commandant_bord: 'Pilote', role_pilote: 'Pilote', statut: 'en_attente' }; }
async function create(db, value = row()) { const r = await db.query('select save_armee_vol($1, null, $2, $3, 60, 0) id', [ids.pilot, value, [ids.pilot]]); return r.rows[0].id; }
const decide = (db, id, action = 'validé') => db.query('select decide_armee_vol($1, $2, $3, $4, 60)', [ids.chief, id, action, action === 'refusé' ? 'À corriger' : null]);

test('repeated validation creates exactly one credit, one transaction and one mission log', async () => {
  const db = await setup(); try {
    const id = await create(db); await decide(db, id); await decide(db, id);
    assert.equal((await db.query('select count(*)::int n from felitz_transactions')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from armee_missions_log')).rows[0].n, 1);
    assert.equal((await db.query('select solde::int n from felitz_comptes')).rows[0].n, 19800);
    await assert.rejects(create(db), /Délai/);
  } finally { await db.close(); }
});
test('a failed journal insert rolls back bank credit, history and decision, and retry succeeds', async () => {
  const db = await setup(); try {
    const id = await create(db);
    await db.exec("create function break_log() returns trigger language plpgsql as $$begin raise exception 'injected failure'; end$$; create trigger fail_log before insert on armee_missions_log for each row execute function break_log();");
    await assert.rejects(decide(db, id), /injected failure/);
    assert.equal((await db.query('select solde::int n from felitz_comptes')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from felitz_transactions')).rows[0].n, 0);
    assert.equal((await db.query('select statut from vols')).rows[0].statut, 'en_attente');
    await db.exec('drop trigger fail_log on armee_missions_log'); await decide(db, id);
    assert.equal((await db.query('select count(*)::int n from armee_missions_log')).rows[0].n, 1);
  } finally { await db.close(); }
});
test('pending duplicate missions and non-military crew are refused without changing the dossier', async () => {
  const db = await setup(); try {
    const id = await create(db); await assert.rejects(create(db), /déjà ouvert/);
    await assert.rejects(db.query('select save_armee_vol($1,$2,$3,$4,60,0)', [ids.pilot, id, { copilote_id: ids.civil }, [ids.pilot]]), /participant/);
    assert.equal((await db.query('select copilote_id from vols')).rows[0].copilote_id, null);
    assert.equal((await db.query('select count(*)::int n from vols_equipage_militaire')).rows[0].n, 1);
    await db.exec(`update profiles set blocked_until = now() + interval '1 hour' where id = '${ids.pilot}'`);
    await assert.rejects(db.query('select save_armee_vol($1,$2,$3,$4,60,0)', [ids.pilot, id, {}, null]), /suspendu/);
  } finally { await db.close(); }
});
test('ordinary authenticated clients cannot execute privileged mutations', async () => {
  const db = await setup(); try {
    await db.exec('set role authenticated');
    await assert.rejects(create(db), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
test('validation waiting time does not reduce the frozen reward and future arrivals cannot be paid', async () => {
  const db = await setup(); try {
    const value = row(); value.depart_utc = new Date(Date.now() - 36 * 60_000).toISOString();
    const id = await create(db, value);
    await db.query("update vols set created_at = arrivee_utc, arrivee_utc = arrivee_utc - interval '2 hours' where id = $1", [id]);
    // Simulate a dossier deposited on time with a later administrative validation.
    await db.query("update vols set created_at = arrivee_utc where id = $1", [id]);
    await decide(db, id);
    assert.equal((await db.query('select mission_reward_final from vols')).rows[0].mission_reward_final, 20000);
  } finally { await db.close(); }
  const db2 = await setup(); try {
    const future = row(); future.depart_utc = new Date().toISOString();
    const id = await create(db2, future); await assert.rejects(decide(db2, id), /avant son arrivée/);
  } finally { await db2.close(); }
});
test('aggregate statistics include more than 1000 rows and preserve payment history', async () => {
  const db = await setup(); try {
    await db.exec(`insert into armee_missions_log(mission_id,user_id,reward) select 'archive', '${ids.pilot}', 100 from generate_series(1,1205)`);
    const result = await db.query('select get_armee_pilot_stats($1) stats', [ids.pilot]);
    assert.equal(result.rows[0].stats.completed, 1205);
    assert.equal(result.rows[0].stats.reward, 120500);
    const honor = await db.query('select get_armee_honor_board(7) board');
    assert.equal(honor.rows[0].board[0].missionsCount, 1205);
    const id = await create(db); await decide(db, id);
    await assert.rejects(db.query('select delete_armee_vol($1,$2)', [ids.pilot, id]), /payé/);
    await assert.rejects(db.query('delete from vols where id = $1', [id]), /payé/);
    await assert.rejects(db.query("update vols set statut = 'refusé' where id = $1", [id]), /sécurisée/);
    await db.query('delete from profiles where id = $1', [ids.pilot]);
    assert.equal((await db.query("select count(*)::int n from armee_operations_log where action = 'archivage_profil'")).rows[0].n, 1);
  } finally { await db.close(); }
});
test('crew replacement is rolled back if insertion fails, and repeat refusal is idempotent', async () => {
  const db = await setup(); try {
    const id = await create(db);
    await db.exec("create function break_crew() returns trigger language plpgsql as $$begin raise exception 'crew failed'; end$$; create trigger fail_crew before insert on vols_equipage_militaire for each row execute function break_crew();");
    await assert.rejects(db.query('select save_armee_vol($1,$2,$3,$4,60,0)', [ids.pilot, id, { callsign: 'NEW' }, [ids.pilot, ids.chief]]), /crew failed/);
    assert.equal((await db.query('select callsign from vols')).rows[0].callsign, null);
    assert.equal((await db.query('select count(*)::int n from vols_equipage_militaire')).rows[0].n, 1);
    await decide(db, id, 'refusé'); await decide(db, id, 'refusé');
    assert.equal((await db.query('select mission_refusals from vols')).rows[0].mission_refusals, 1);
    await db.query('select save_armee_vol($1,$2,$3,null,60,0)', [ids.pilot, id, { callsign: 'CORRIGE' }]);
    assert.equal((await db.query('select statut from vols')).rows[0].statut, 'en_attente');
    await decide(db, id, 'refusé');
    assert.equal((await db.query('select mission_refusals from vols')).rows[0].mission_refusals, 2);
  } finally { await db.close(); }
});
test('briefing publication and command journal are committed together', async () => {
  const db = await setup(); try {
    await assert.rejects(db.query('select save_armee_briefing($1,$2,$3,$4)', [ids.pilot, 'Ordres', 'Consignes', true]), /non autorisée/);
    await db.query('select save_armee_briefing($1,$2,$3,$4)', [ids.chief, 'Ordres', 'Consignes', true]);
    assert.equal((await db.query('select contenu from armee_briefing')).rows[0].contenu, 'Consignes');
    assert.equal((await db.query("select count(*)::int n from armee_operations_log where action = 'briefing'")).rows[0].n, 1);
  } finally { await db.close(); }
});
