// Même moteur PostgreSQL isolé que scripts/test-armee-sql.cjs.
const { PGlite } = require('../tmp/armee-sql-tests/node_modules/@electric-sql/pglite');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const org = '33333333-3333-4333-8333-333333333333';
async function setup(type) {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.actor')::uuid $$;
    CREATE TABLE profiles(id uuid PRIMARY KEY);
    CREATE TABLE compagnies(id uuid PRIMARY KEY, pdg_id uuid REFERENCES profiles);
    CREATE TABLE entreprises_reparation(id uuid PRIMARY KEY, pdg_id uuid REFERENCES profiles, updated_at timestamptz);
    CREATE TABLE compagnie_employes(compagnie_id uuid, pilote_id uuid, role text);
    CREATE TABLE reparation_employes(entreprise_id uuid, user_id uuid REFERENCES profiles, role text, UNIQUE(entreprise_id,user_id));
    INSERT INTO profiles VALUES ('${actor}'), ('${target}');
    SET test.actor = '${actor}';`);
  await db.exec(fs.readFileSync('supabase/add_transfert_propriete.sql', 'utf8'));
  const table = type === 'compagnie' ? 'compagnies' : 'entreprises_reparation';
  await db.exec(`INSERT INTO ${table}(id,pdg_id) VALUES ('${org}','${actor}');
    INSERT INTO compagnie_employes VALUES ('${org}','${actor}','co_pdg'), ('${org}','${target}','co_pdg');
    INSERT INTO reparation_employes VALUES ('${org}','${actor}','pdg'), ('${org}','${target}','logistique');`);
  return db;
}
const transfer = (db, type, confirmations = [true, 'oui', true], recipient = target) => db.query(
  'SELECT transferer_propriete($1,$2,$3,$4,$5,$6)', [type, org, recipient, ...confirmations]);
for (const type of ['compagnie', 'reparation']) {
  test(`${type}: confirmations, identité, transfert et répétition`, async () => {
    const db = await setup(type);
    try {
      for (const confirmations of [[false,'oui',true], [true,'non',true], [true,'oui',false], [true,null,true]]) {
        await assert.rejects(transfer(db, type, confirmations), /trois confirmations/);
      }
      await assert.rejects(transfer(db, type, undefined, actor), /invalide/);
      await db.exec(`SET test.actor = '${target}'`);
      await assert.rejects(transfer(db, type), /Seul le PDG/);
      await db.exec(`SET test.actor = '${actor}'`);
      await transfer(db, type);
      const table = type === 'compagnie' ? 'compagnies' : 'entreprises_reparation';
      assert.equal((await db.query(`SELECT pdg_id FROM ${table}`)).rows[0].pdg_id, target);
      if (type === 'compagnie') {
        assert.ok((await db.query('SELECT role FROM compagnie_employes')).rows.every(r => r.role === 'employe'));
      } else {
        assert.equal((await db.query('SELECT role FROM reparation_employes WHERE user_id=$1', [actor])).rows[0].role, 'technicien');
        assert.equal((await db.query('SELECT role FROM reparation_employes WHERE user_id=$1', [target])).rows[0].role, 'pdg');
      }
      await assert.rejects(transfer(db, type), /Seul le PDG/);
    } finally { await db.close(); }
  });
}
test('un échec de mise à jour des employés annule tout le transfert', async () => {
  const db = await setup('reparation');
  try {
    await db.exec(`CREATE FUNCTION fail_employee() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
      CREATE TRIGGER fail_employee BEFORE UPDATE ON reparation_employes FOR EACH ROW EXECUTE FUNCTION fail_employee();`);
    await assert.rejects(transfer(db, 'reparation'), /injected failure/);
    assert.equal((await db.query('SELECT pdg_id FROM entreprises_reparation')).rows[0].pdg_id, actor);
  } finally { await db.close(); }
});
