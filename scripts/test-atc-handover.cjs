const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
test('three warning boundaries use server-adjusted time and stop at the reservation',()=>{
  const m={exports:{}};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/events/handover-rules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports);
  const stage=m.exports.handoverWarningStage,start=1000000;
  for(const [remaining,expected] of [[180001,0],[180000,1],[120001,1],[120000,2],[60001,2],[60000,3],[1,3],[0,0],[-1,0]])assert.equal(stage(start,start-remaining),expected);
});
async function setup(){
  const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid primary key,atc_temps_total_minutes integer default 0);
    CREATE TABLE atc_sessions(id uuid primary key,user_id uuid,aeroport text,position text,started_at timestamptz);
    CREATE TABLE event_reservations(id uuid primary key,user_id uuid,airport text,position text,role text,status text,starts_at timestamptz,ends_at timestamptz);
    CREATE TABLE atc_taxes_pending(id uuid default gen_random_uuid(),session_id uuid references atc_sessions(id) on delete cascade,montant integer);
    CREATE TABLE felitz_comptes(id uuid primary key default gen_random_uuid(),proprietaire_id uuid,type text,vban text unique,solde integer,created_at timestamptz default now());
    CREATE TABLE messages(id uuid default gen_random_uuid(),destinataire_id uuid,expediteur_id uuid,titre text,contenu text,type_message text,cheque_montant bigint,cheque_encaisse boolean,cheque_destinataire_compte_id uuid,cheque_libelle text,cheque_pour_compagnie boolean);
    CREATE TABLE plans_vol(id uuid default gen_random_uuid(),current_holder_user_id uuid,current_holder_position text,current_holder_aeroport text,pending_transfer_aeroport text,pending_transfer_position text,pending_transfer_at timestamptz,strip_zone text,automonitoring boolean,statut text);
    INSERT INTO profiles(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
    INSERT INTO atc_sessions VALUES('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','ITKO','Tower',now()-interval '10 minutes');
    INSERT INTO atc_taxes_pending(session_id,montant) VALUES('33333333-3333-4333-8333-333333333333',500);
    INSERT INTO plans_vol(current_holder_user_id,statut,automonitoring) VALUES('11111111-1111-4111-8111-111111111111','en_cours',false);
    INSERT INTO event_reservations VALUES('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','ITKO','Tower','atc','confirmed',now()+interval '1 minute',now()+interval '1 hour');`);
  await db.exec(fs.readFileSync('supabase/atc_reservation_handover.sql','utf8').split('-- Supabase Cron')[0]);return db;
}
test('future/cancelled/own/different-position bookings never expel a controller',async()=>{
 const db=await setup();try{
 assert.equal((await db.query('select enforce_atc_reservations() n')).rows[0].n,0);
 for(const change of ["status='cancelled'","user_id='11111111-1111-4111-8111-111111111111'","position='Ground'","ends_at=now()-interval '1 second'"]){
   await db.exec(`UPDATE event_reservations SET starts_at=now()-interval '1 minute',status='confirmed',user_id='22222222-2222-4222-8222-222222222222',position='Tower',ends_at=now()+interval '1 hour'; UPDATE event_reservations SET ${change};`);
   assert.equal((await db.query('select enforce_atc_reservations() n')).rows[0].n,0);
 }
 }finally{await db.close();}
});
test('due handover pays once, releases flights and protects the incoming controller',async()=>{
 const db=await setup();try{
 await db.exec("UPDATE event_reservations SET starts_at=now()-interval '1 second'");
 assert.equal((await db.query('select enforce_atc_reservations() n')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from atc_sessions')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from atc_reservation_evictions')).rows[0].n,1);
 const flight=(await db.query('select * from plans_vol')).rows[0];assert.equal(flight.current_holder_user_id,null);assert.equal(flight.automonitoring,true);
 const paid=(await db.query('select cheque_montant from messages')).rows;assert.equal(paid.length,1);assert.equal(Number(paid[0].cheque_montant),5900);
 assert.equal((await db.query('select enforce_atc_reservations() n')).rows[0].n,0);
 await db.query("select finish_atc_service('33333333-3333-4333-8333-333333333333',true)");
 assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n,1);
 await db.exec("INSERT INTO atc_sessions VALUES(gen_random_uuid(),'22222222-2222-4222-8222-222222222222','ITKO','Tower',now())");
 assert.equal((await db.query('select enforce_atc_reservations() n')).rows[0].n,0);
 assert.equal((await db.query("select has_function_privilege('authenticated','enforce_atc_reservations()','execute') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
test('voluntary end refuses held flights and rolls back entirely on payment failure',async()=>{
 const db=await setup();try{
 await assert.rejects(db.query("select finish_atc_service('33333333-3333-4333-8333-333333333333',false)"),/FLIGHTS_HELD/);
 await db.exec("ALTER TABLE messages ADD CHECK (cheque_montant<0);UPDATE event_reservations SET starts_at=now()-interval '1 second'");
 await assert.rejects(db.query('select enforce_atc_reservations()'));
 assert.equal((await db.query('select count(*)::int n from atc_sessions')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from atc_taxes_pending')).rows[0].n,1);
 assert.equal((await db.query('select atc_temps_total_minutes n from profiles order by id limit 1')).rows[0].n,0);
 }finally{await db.close();}
});
