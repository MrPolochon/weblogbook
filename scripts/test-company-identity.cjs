const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;

test('identity workflow preserves active values until atomic IFSA approval, enforces permissions and retains decisions',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE profiles(id uuid PRIMARY KEY,role text,ifsa boolean);
   CREATE TABLE compagnies(id uuid PRIMARY KEY,pdg_id uuid,code_oaci text,callsign_telephonie text);
   CREATE TABLE compagnie_employes(compagnie_id uuid,pilote_id uuid,role text);
   INSERT INTO profiles VALUES('${id(1)}','pilote',false),('${id(2)}','pilote',true),('${id(3)}','pilote',false),('${id(4)}','pilote',false);
   INSERT INTO compagnies VALUES('${id(10)}','${id(1)}','SBU','BLACK FIN'),('${id(11)}','${id(3)}','UAE','EMIRATES');
   INSERT INTO compagnie_employes VALUES('${id(10)}','${id(4)}','co_pdg');`);
  const sql=fs.readFileSync('supabase/add_compagnie_identite_approvals.sql','utf8');
  await db.exec(sql);await db.exec(sql);
  const submit=async(code='ABC',radio='TEST AIR',actor=1)=>(await db.query('SELECT demander_identite_compagnie($1,$2,$3,$4) AS d',[id(10),id(actor),code,radio])).rows[0].d;
  const decide=async(d,action='approuver',actor=2,motif='Conformité vérifiée')=>(await db.query('SELECT decider_identite_compagnie($1,$2,$3,$4) AS d',[d.id,id(actor),action,motif])).rows[0].d;
  const current=async()=>(await db.query('SELECT code_oaci,callsign_telephonie FROM compagnies WHERE id=$1',[id(10)])).rows[0];
  await assert.rejects(()=>submit('ABC','TEST AIR',3),/Non autorisé/);
  await assert.rejects(()=>submit('ABCD'),/trois lettres/);
  await assert.rejects(()=>submit('ABC','TEST123'),/radiophonie/);
  assert.equal((await submit('SBU','BLACK FIN')).inchangee,true);
  const d=await submit('abc','test   air',4);
  assert.equal(d.nouveau_code_oaci,'ABC');assert.equal(d.nouvelle_telephonie,'TEST AIR');
  assert.deepEqual(await current(),{code_oaci:'SBU',callsign_telephonie:'BLACK FIN'});
  assert.equal((await submit()).id,d.id);
  await assert.rejects(()=>submit('DEF'),/déjà en attente/);
  await assert.rejects(()=>db.query("UPDATE compagnies SET code_oaci='DEF' WHERE id=$1",[id(10)]),/approbation IFSA/);
  await assert.rejects(()=>decide(d,'approuver',1),/Réservé/);
  await assert.rejects(()=>decide(d,'approuver',2,''),/motif/);
  const approved=await decide(d);
  assert.equal(approved.statut,'approuvee');assert.equal(approved.traite_par_id,id(2));
  assert.deepEqual(await current(),{code_oaci:'ABC',callsign_telephonie:'TEST AIR'});
  await assert.rejects(()=>decide(d),/déjà été traitée/);
  const duplicate=await submit('UAE','EMIRATES');
  await assert.rejects(()=>decide(duplicate),/déjà utilisé/);
  assert.equal((await db.query('SELECT statut FROM compagnie_identite_demandes WHERE id=$1',[duplicate.id])).rows[0].statut,'en_attente');
  await decide(duplicate,'refuser');assert.equal((await current()).code_oaci,'ABC');
  const stale=await submit('GHI','OTHER AIR');
  await db.exec(`ALTER TABLE compagnies DISABLE TRIGGER compagnie_identite_approbation;UPDATE compagnies SET code_oaci='JKL' WHERE id='${id(10)}';ALTER TABLE compagnies ENABLE TRIGGER compagnie_identite_approbation;`);
  await assert.rejects(()=>decide(stale),/actuelle a changé/);await decide(stale,'refuser');
  const rollback=await submit('MNO','NEW AIR');
  await db.exec(`CREATE FUNCTION fail_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'storage failed';END $$;CREATE TRIGGER fail_identity BEFORE UPDATE ON compagnies FOR EACH ROW EXECUTE FUNCTION fail_identity();`);
  await assert.rejects(()=>decide(rollback),/storage failed/);
  assert.equal((await db.query('SELECT statut FROM compagnie_identite_demandes WHERE id=$1',[rollback.id])).rows[0].statut,'en_attente');
  assert.equal((await current()).code_oaci,'JKL');
  const grants=(await db.query(`SELECT has_function_privilege('authenticated','public.decider_identite_compagnie(uuid,uuid,text,text)','EXECUTE') AS decision,
    has_function_privilege('authenticated','public.demander_identite_compagnie(uuid,uuid,text,text)','EXECUTE') AS submission,
    has_table_privilege('authenticated','public.compagnie_identite_demandes','INSERT') AS forge`)).rows[0];
  assert.deepEqual(grants,{decision:false,submission:false,forge:false});
 } finally {await db.close()}
});
