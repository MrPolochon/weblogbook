const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const pilot=id(1),admin=id(2),instructor=id(3),copilot=id(4),newPilot=id(5);
async function context(db,role,user=null,claim=role){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:claim})]);await db.exec('SET ROLE '+role);}
async function setup(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,identifiant text,role text NOT NULL DEFAULT 'pilote',armee boolean DEFAULT false,atc boolean DEFAULT false,siavi boolean DEFAULT false,ifsa boolean DEFAULT false,ground_crew boolean DEFAULT false,atc_grade_id uuid,siavi_grade_id uuid,admin_role_ids text[] DEFAULT '{}',heures_initiales_minutes int DEFAULT 0,blocked_until timestamptz,block_reason text,sanction_blocage_vol boolean DEFAULT false,sanction_blocage_motif text,sanction_blocage_jusqu_au timestamptz,atis_code_auto_rotate boolean DEFAULT false);
 CREATE TABLE vols(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pilote_id uuid NOT NULL,type_vol text NOT NULL DEFAULT 'IFR',statut text NOT NULL DEFAULT 'en_attente',duree_minutes integer DEFAULT 20,callsign text,copilote_id uuid,copilote_confirme_par_pilote boolean DEFAULT false,instructeur_id uuid,instruction_type text,created_by_admin boolean DEFAULT false,created_by_user_id uuid,refusal_count integer DEFAULT 0,refusal_reason text,editing_by_pilot_id uuid,editing_started_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),mission_id uuid,mission_reward_final integer,mission_refusals integer DEFAULT 0,chef_escadron_id uuid);
 INSERT INTO profiles(id,identifiant,role) VALUES('${pilot}','Pilote','pilote'),('${admin}','Admin','admin'),('${instructor}','Instructeur','instructeur'),('${copilot}','Copilote','pilote');
 INSERT INTO vols(id,pilote_id,statut,refusal_count,refusal_reason) VALUES('${id(100)}','${pilot}','refusé',1,'À corriger');
 ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;ALTER TABLE vols ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA auth TO authenticated,service_role;GRANT ALL ON profiles,vols TO service_role;GRANT SELECT,INSERT,UPDATE ON profiles,vols TO authenticated;`);
 // Les politiques utilisées sont réellement celles du dépôt, pas une version durcie de test.
 const schema=fs.readFileSync('supabase/schema.sql','utf8');
 const helper=schema.match(/CREATE OR REPLACE FUNCTION public\.is_admin\(\)[\s\S]*?LANGUAGE sql SECURITY DEFINER STABLE;/)[0];await db.exec(helper);
 for(const name of ['profiles_select','profiles_insert','profiles_update_self','profiles_update_admin','vols_select_own','vols_select_admin','vols_insert','vols_update_own','vols_update_admin']){
  const sql=schema.match(new RegExp('CREATE POLICY "'+name+'"[\\s\\S]*?;'))?.[0];assert(sql,name);await db.exec(sql);
 }
 return db;
}
test('database enforces staff validation and protects its profile trust root',async t=>{
 const db=await setup();t.after(()=>db.close());
 const migration=fs.readFileSync('supabase/logbook_staff_validation_20261029.sql','utf8');
 const historyBefore=(await db.query('SELECT row_to_json(v) r FROM vols v ORDER BY id')).rows;
 await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query('SELECT row_to_json(v) r FROM vols v ORDER BY id')).rows,historyBefore);

 await t.test('ordinary pending insertion and correction remain available',async()=>{
  await context(db,'authenticated',pilot);
  await db.query('INSERT INTO vols(id,pilote_id) VALUES($1,$2)',[id(101),pilot]);
  await db.query("UPDATE vols SET callsign='CORR101',duree_minutes=25,type_vol='VFR' WHERE id=$1",[id(101)]);
  const row=(await db.query('SELECT statut,callsign FROM vols WHERE id=$1',[id(101)])).rows[0];assert.equal(row.statut,'en_attente');assert.equal(row.callsign,'CORR101');
 });
 await t.test('a pilot cannot insert a decision, confirmation or privileged mission record',async()=>{
  for(const statut of ['validé','refusé','en_attente_confirmation_instructeur','en_attente_confirmation_pilote','en_attente_confirmation_copilote'])await assert.rejects(()=>db.query('INSERT INTO vols(pilote_id,statut) VALUES($1,$2)',[pilot,statut]),/validation|confirmations/);
  await assert.rejects(()=>db.query("INSERT INTO vols(pilote_id,type_vol) VALUES($1,'Vol militaire')",[pilot]),/validation/);
  for(const [field,value] of [['created_by_admin',true],['created_by_user_id',admin],['copilote_confirme_par_pilote',true],['instructeur_id',instructor],['mission_reward_final',100000]])await assert.rejects(()=>db.query(`INSERT INTO vols(pilote_id,${field}) VALUES($1,$2)`,[pilot,value]),/serveur/);
 });
 await t.test('pending entries cannot be self-validated, self-refused or given artificial confirmations',async()=>{
  for(const statut of ['validé','refusé','en_attente_confirmation_instructeur'])await assert.rejects(()=>db.query('UPDATE vols SET statut=$2 WHERE id=$1',[id(101),statut]),/validation|confirmations/);
  await assert.rejects(()=>db.query('UPDATE vols SET created_by_admin=true,created_by_user_id=$2 WHERE id=$1',[id(101),admin]),/serveur/);
  await assert.rejects(()=>db.query('UPDATE vols SET copilote_confirme_par_pilote=true WHERE id=$1',[id(101)]),/serveur/);
  await assert.rejects(()=>db.query('UPDATE vols SET mission_reward_final=99999 WHERE id=$1',[id(101)]),/serveur/);
  await assert.rejects(()=>db.query("UPDATE vols SET instruction_type='FI' WHERE id=$1",[id(101)]),/serveur/);
  await assert.rejects(()=>db.query('UPDATE vols SET editing_by_pilot_id=$2 WHERE id=$1',[id(101),admin]),/serveur/);
 });
 await t.test('a refused flight may be corrected and resubmitted without clearing staff history',async()=>{
  await db.query("UPDATE vols SET callsign='CORR100',statut='en_attente' WHERE id=$1",[id(100)]);
  const row=(await db.query('SELECT statut,refusal_count,refusal_reason FROM vols WHERE id=$1',[id(100)])).rows[0];assert.equal(row.statut,'en_attente');assert.equal(row.refusal_count,1);
  await assert.rejects(()=>db.query('UPDATE vols SET refusal_count=0,refusal_reason=NULL WHERE id=$1',[id(100)]),/serveur/);
 });
 await t.test('direct profile self-promotion and sanction/initial-hours changes are denied',async()=>{
  for(const [field,value] of [['role','admin'],['armee',true],['atc',true],['siavi',true],['ifsa',true],['ground_crew',true],['atc_grade_id',id(200)],['heures_initiales_minutes',99999],['sanction_blocage_vol',true]])await assert.rejects(()=>db.query(`UPDATE profiles SET ${field}=$2 WHERE id=$1`,[pilot,value]),/habilitations|sanctions/);
  await assert.rejects(()=>db.query("UPDATE profiles SET admin_role_ids=ARRAY['admin'] WHERE id=$1",[pilot]),/habilitations/);
  await db.query("UPDATE profiles SET identifiant='Pilote corrigé',atis_code_auto_rotate=true WHERE id=$1",[pilot]);
  assert.equal((await db.query('SELECT role FROM profiles WHERE id=$1',[pilot])).rows[0].role,'pilote');
 });
 await t.test('a fresh self profile receives ordinary defaults but cannot be born administrator',async()=>{
  await context(db,'authenticated',newPilot);
  await assert.rejects(()=>db.query("INSERT INTO profiles(id,identifiant,role) VALUES($1,'Escalade','admin')",[newPilot]),/habilitations/);
  await assert.rejects(()=>db.query("INSERT INTO profiles(id,identifiant,armee,heures_initiales_minutes) VALUES($1,'Escalade',true,500)",[newPilot]),/habilitations/);
  await db.query("INSERT INTO profiles(id,identifiant) VALUES($1,'Nouveau pilote')",[newPilot]);
  assert.equal((await db.query('SELECT role FROM profiles WHERE id=$1',[newPilot])).rows[0].role,'pilote');
 });
 await t.test('JWT role text alone cannot turn an authenticated caller into a service writer',async()=>{
  await context(db,'authenticated',pilot,'service_role');
  await assert.rejects(()=>db.query("UPDATE vols SET statut='validé' WHERE id=$1",[id(101)]),/validation/);
  await assert.rejects(()=>db.query("UPDATE profiles SET role='admin' WHERE id=$1",[pilot]),/habilitations/);
 });
 await t.test('an actual authenticated administrator may validate and manage privileges',async()=>{
  await context(db,'authenticated',admin);
  await db.query("UPDATE vols SET statut='validé',created_by_admin=true,created_by_user_id=$2 WHERE id=$1",[id(101),admin]);
  assert.equal((await db.query('SELECT statut FROM vols WHERE id=$1',[id(101)])).rows[0].statut,'validé');
  await db.query('UPDATE profiles SET armee=true WHERE id=$1',[pilot]);
 });
 await t.test('the service role preserves checked instructor, copilot and military workflows',async()=>{
  await context(db,'service_role');
  await db.query("INSERT INTO vols(id,pilote_id,type_vol,statut,instructeur_id) VALUES($1,$2,'Instruction','en_attente_confirmation_instructeur',$3)",[id(110),pilot,instructor]);
  await db.query("UPDATE vols SET statut='validé' WHERE id=$1",[id(110)]);
  await db.query("INSERT INTO vols(id,pilote_id,copilote_id,statut) VALUES($1,$2,$3,'en_attente_confirmation_copilote')",[id(111),pilot,copilot]);
  await db.query("UPDATE vols SET statut='en_attente',copilote_confirme_par_pilote=true WHERE id=$1",[id(111)]);
  await db.query("INSERT INTO vols(id,pilote_id,type_vol,statut,mission_reward_final) VALUES($1,$2,'Vol militaire','validé',5000)",[id(112),pilot]);
  await db.query('UPDATE profiles SET armee=false WHERE id=$1',[pilot]);
  assert.equal((await db.query("SELECT count(*)::int n FROM vols WHERE id=ANY($1::uuid[])",[[id(110),id(111),id(112)]])).rows[0].n,3);
 });
 await t.test('instructors and copilots cannot bypass the checked service API',async()=>{
  await context(db,'authenticated',instructor);
  const res=await db.query("UPDATE vols SET statut='validé' WHERE id=$1 RETURNING id",[id(111)]);assert.equal(res.rows.length,0);
  await assert.rejects(()=>db.query("INSERT INTO vols(pilote_id,type_vol,statut,instructeur_id) VALUES($1,'Instruction','validé',$1)",[instructor]),/validation/);
  await context(db,'authenticated',copilot);
  await assert.rejects(()=>db.query("INSERT INTO vols(pilote_id,copilote_id,statut) VALUES($1,$2,'validé')",[pilot,copilot]),/non autorisée|row-level security/);
 });
 await t.test('a third staff refusal cannot be bypassed with a direct correction',async()=>{
  await context(db,'service_role');
  await db.query("INSERT INTO vols(id,pilote_id,statut,refusal_count) VALUES($1,$2,'refusé',3)",[id(113),pilot]);
  await context(db,'authenticated',pilot);
  await assert.rejects(()=>db.query("UPDATE vols SET statut='en_attente',callsign='RESET' WHERE id=$1",[id(113)]),/trois fois/);
 });
 await t.test('an existing access sanction cannot be cleared by its owner',async()=>{
  await context(db,'service_role');
  await db.query("UPDATE profiles SET blocked_until='2026-12-01Z',block_reason='Décision staff',sanction_blocage_vol=true WHERE id=$1",[pilot]);
  await context(db,'authenticated',pilot);
  await assert.rejects(()=>db.query('UPDATE profiles SET blocked_until=NULL,block_reason=NULL,sanction_blocage_vol=false WHERE id=$1',[pilot]),/sanctions/);
 });
 await t.test('clients cannot invoke privileged helper functions',async()=>{
  for(const role of ['anon','authenticated']){await context(db,role,pilot);await assert.rejects(()=>db.query('SELECT logbook_is_privileged_writer()'),/permission denied/);}
 });
});

test('staff guard and atomic logbook registration compose without losing a pending flight',async t=>{
 const db=await setup();t.after(()=>db.close());
 await db.exec(`
  ALTER TABLE vols ADD COLUMN type_avion_id uuid,ADD COLUMN compagnie_id uuid,ADD COLUMN compagnie_libelle text,
   ADD COLUMN aeroport_depart text,ADD COLUMN aeroport_arrivee text,ADD COLUMN depart_utc timestamptz,
   ADD COLUMN arrivee_utc timestamptz,ADD COLUMN commandant_bord text,ADD COLUMN role_pilote text;
  CREATE TABLE plans_vol(id uuid PRIMARY KEY,pilote_id uuid NOT NULL,copilote_id uuid,statut text NOT NULL,
   siavi_avion_id uuid,armee_mission_id uuid,aeroport_depart text,aeroport_arrivee text,type_vol text,
   numero_vol text,temps_prev_min integer,accepted_at timestamptz,cloture_at timestamptz);
 `);
 const staffSql=fs.readFileSync('supabase/logbook_staff_validation_20261029.sql','utf8');
 const registrationSql=fs.readFileSync('supabase/logbook_registration_20261029.sql','utf8');
 await db.exec(staffSql);await db.exec(registrationSql);
 await db.exec(staffSql);await db.exec(registrationSql);
 const source=id(300);
 await db.query(`INSERT INTO plans_vol(id,pilote_id,statut,aeroport_depart,aeroport_arrivee,type_vol,numero_vol,temps_prev_min,accepted_at,cloture_at)
  VALUES($1,$2,'cloture','IRFD','ILAR','IFR','TEST300',10,'2026-10-29T18:00Z','2026-10-29T18:10Z')`,[source,pilot]);
 const row={pilote_id:pilot,type_avion_id:id(50),compagnie_libelle:'Compagnie',aeroport_depart:'IRFD',aeroport_arrivee:'ILAR',
  duree_minutes:10,depart_utc:'2026-10-29T18:00Z',arrivee_utc:'2026-10-29T18:10Z',type_vol:'IFR',
  commandant_bord:'Pilote',role_pilote:'Pilote',callsign:'TEST300',statut:'en_attente'};
 await context(db,'service_role');
 const save=async value=>(await db.query('SELECT register_logbook_flight($1,$2::jsonb,$3) result',[pilot,JSON.stringify(value),source])).rows[0].result;
 const first=await save(row);assert(first.ok&&!first.duplicate);assert.equal(first.statut,'en_attente');
 const retry=await save(row);assert(retry.ok&&retry.duplicate);assert.equal(retry.id,first.id);
 const available=(await db.query('SELECT * FROM get_unrecorded_closed_plans($1)',[pilot])).rows;
 assert(!available.some(plan=>plan.id===source));
 assert.equal((await save({...row,statut:'validé'})).code,'STAFF_VALIDATION_REQUIRED');
 await context(db,'authenticated',pilot);
 await assert.rejects(()=>db.query("UPDATE vols SET statut='validé' WHERE id=$1",[first.id]),/validation/);
 await context(db,'authenticated',admin);
 await db.query("UPDATE vols SET statut='validé' WHERE id=$1",[first.id]);
 assert.equal((await db.query('SELECT statut FROM vols WHERE id=$1',[first.id])).rows[0].statut,'validé');
});
