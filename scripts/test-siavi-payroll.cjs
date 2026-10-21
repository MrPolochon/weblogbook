const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
test('SIAVI payroll: hourly rates, mode switch, logout, atomic call bonus and duplicate protection',async()=>{const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,siavi boolean);INSERT INTO profiles VALUES('${id(1)}','siavi',true),('${id(2)}','siavi',true),('${id(3)}','atc',false);
 CREATE TABLE afis_sessions(id uuid PRIMARY KEY,user_id uuid,est_afis boolean,aeroport text);
 CREATE TABLE atc_calls(id uuid PRIMARY KEY,from_user_id uuid,to_user_id uuid,status text,is_emergency boolean,answered_at timestamptz);
 CREATE TABLE felitz_comptes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,proprietaire_id uuid,vban text UNIQUE,solde bigint,created_at timestamptz DEFAULT now());
 CREATE TABLE felitz_transactions(id uuid DEFAULT gen_random_uuid(),compte_id uuid,type text,montant bigint,libelle text);
 `);await db.exec(fs.readFileSync('supabase/siavi_service_remuneration_v2.sql','utf8'));
 // Attempted client-supplied salary baseline/remainder must be ignored on service start.
 await db.query('INSERT INTO afis_sessions(id,user_id,est_afis,aeroport,salaire_depuis,salaire_reste) VALUES($1,$2,false,\'IRFD\',now()-interval \'10 years\',999999999)',[id(10),id(1)]);
 assert.equal(Number((await db.query('SELECT salaire_reste FROM afis_sessions')).rows[0].salaire_reste),0);
 await db.exec(`ALTER TABLE afis_sessions DISABLE TRIGGER siavi_service_settle;UPDATE afis_sessions SET salaire_depuis=statement_timestamp()-interval '1 hour';ALTER TABLE afis_sessions ENABLE TRIGGER siavi_service_settle;UPDATE afis_sessions SET est_afis=true;`);
 let total=Number((await db.query('SELECT sum(solde) total FROM felitz_comptes')).rows[0].total);assert(total>=100000&&total<100100);
 const checkpoint=total;await db.query('SELECT pay_active_siavi_services()');assert.equal(Number((await db.query('SELECT sum(solde) total FROM felitz_comptes')).rows[0].total),checkpoint);
 await db.exec(`ALTER TABLE afis_sessions DISABLE TRIGGER siavi_service_settle;UPDATE afis_sessions SET salaire_depuis=statement_timestamp()-interval '30 minutes';ALTER TABLE afis_sessions ENABLE TRIGGER siavi_service_settle;DELETE FROM afis_sessions;`);
 total=Number((await db.query('SELECT sum(solde) total FROM felitz_comptes')).rows[0].total);assert(total>=200000&&total<200200);
 for(const [user,afis,session,call] of [[1,false,11,21],[2,true,12,22]]){
  await db.query('INSERT INTO afis_sessions(id,user_id,est_afis,aeroport) VALUES($1,$2,$3,\'IRFD\')',[id(session),id(user),afis]);await db.query('INSERT INTO atc_calls(id,from_user_id,to_user_id,status,is_emergency) VALUES($1,$2,$3,\'ringing\',false)',[id(call),id(3),id(user)]);
  const before=Number((await db.query('SELECT coalesce(sum(solde),0) total FROM felitz_comptes')).rows[0].total);
  const answer=()=>db.query('SELECT answer_siavi_call($1,$2) result',[id(user),id(call)]);assert.equal((await answer()).rows[0].result.prime,50000);await answer();assert.equal(Number((await db.query('SELECT sum(solde) total FROM felitz_comptes')).rows[0].total),before+50000);
 }
 const denied=await db.query('SELECT answer_siavi_call($1,$2) result',[id(2),id(21)]);assert.equal(denied.rows[0].result.status,403);
 await db.query('INSERT INTO atc_calls(id,from_user_id,to_user_id,status,is_emergency) VALUES($1,$2,$2,\'ringing\',true)',[id(23),id(1)]);assert.equal((await db.query('SELECT answer_siavi_call($1,$2) result',[id(1),id(23)])).rows[0].result.status,403);
 await db.query('INSERT INTO atc_calls(id,from_user_id,to_user_id,status) VALUES($1,$2,$3,\'ringing\')',[id(24),id(3),id(1)]);await db.exec(`CREATE FUNCTION fail_pay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'offline'; END $$;CREATE TRIGGER offline BEFORE INSERT ON felitz_transactions FOR EACH ROW EXECUTE FUNCTION fail_pay();`);await assert.rejects(()=>db.query('SELECT answer_siavi_call($1,$2)',[id(1),id(24)]),/offline/);assert.equal((await db.query('SELECT status FROM atc_calls WHERE id=$1',[id(24)])).rows[0].status,'ringing');assert.equal((await db.query('SELECT count(*)::int n FROM siavi_service_payments WHERE call_id=$1',[id(24)])).rows[0].n,0);
}finally{await db.close();}});
