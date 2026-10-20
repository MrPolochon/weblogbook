// Moteur PostgreSQL isolé : npm install --prefix tmp/armee-sql-tests --no-save --package-lock=false @electric-sql/pglite
const { PGlite } = require('../tmp/armee-sql-tests/node_modules/@electric-sql/pglite');
const { test } = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs');
const uuid = n => `${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE profiles(id uuid primary key,role text,atc boolean default false,blocked_until timestamptz);
    CREATE TABLE discord_links(user_id uuid primary key,discord_user_id text,status text);
    CREATE TABLE site_calendar_events(id uuid primary key default gen_random_uuid(), title text,description text,location text,starts_at timestamptz,ends_at timestamptz,announce_discord boolean,announce_channel_id text,announce_role_id text,created_by uuid,created_via text,updated_at timestamptz,created_at timestamptz default now());
    CREATE TABLE plans_vol(id uuid primary key default gen_random_uuid(),pilote_id uuid,numero_vol text,aeroport_depart text,aeroport_arrivee text,heure_depart_estimee timestamptz,temps_prev_min integer,deroutement_at timestamptz,statut text default 'depose');
    CREATE TABLE atc_sessions(id uuid primary key default gen_random_uuid(),user_id uuid unique,aeroport text,position text,unique(aeroport,position));
    INSERT INTO profiles VALUES ('${uuid(1)}','pilote',true,null),('${uuid(2)}','atc',true,null),('${uuid(3)}','admin',true,null),('${uuid(4)}','pilote',false,null);
    INSERT INTO discord_links SELECT id,'discord-'||id::text,'active' FROM profiles;
  `);
  await db.exec(fs.readFileSync('supabase/major_events_and_reservations.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/major_events_open_flight_plans.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/major_events_open_flight_plans.sql','utf8')); // Idempotent en production.
  await db.exec(fs.readFileSync('supabase/major_events_open_atc_positions.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/major_events_open_atc_positions.sql','utf8'));
  const start = new Date(Math.floor(Date.now()/600000)*600000 - 600000).toISOString(); const end = new Date(Date.parse(start)+7200000).toISOString();
  const config = { airports:['ITKO'],slot_minutes:10,pilot_capacity:1,atc_positions:['Tower','Ground'],enabled:true,bookings_open:true };
  const event = { title:'Tokyo RFE',starts_at:start,ends_at:end };
  const result = await db.query('select save_major_calendar_event($1,null,$2,$3) id',[uuid(3),event,config]);
  return { db,event,config,id:result.rows[0].id,start,end,slot:new Date(Date.parse(start)+1200000).toISOString() };
}
function pilot(s, changes={}) { return { event_id:s.id,role:'pilot',airport:'ITKO',starts_at:s.slot,ends_at:new Date(Date.parse(s.slot)+600000).toISOString(),movement:'departure',departure:'ITKO',arrival:'IRFD',departure_at:s.slot,duration_minutes:30,callsign:'AFR123',aircraft:'A320',status:'confirmed',...changes }; }
const reserve = async (s,user,data) => (await s.db.query('select reserve_event_slot($1,$2) id',[user,data])).rows[0].id;
const plan = (s,user=uuid(1),changes={}) => s.db.query('insert into plans_vol(pilote_id,numero_vol,aeroport_depart,aeroport_arrivee,heure_depart_estimee,temps_prev_min) values($1,$2,$3,$4,$5,$6) returning *',[user,changes.callsign||'AFR123',changes.departure||'ITKO',changes.arrival||'IRFD',changes.date||s.slot,changes.duration||30]);
test('active major event permits unbooked pilots and manual strips; matching plans claim a slot exactly once',async()=>{
  const s=await setup();try{
    for(const user of [uuid(1),null]) { const open=await plan(s,user); assert.deepEqual(open.rows[0].event_booking_ids,[]); await s.db.query("update plans_vol set statut='en_cours' where id=$1",[open.rows[0].id]); }
    const id=await reserve(s,uuid(1),pilot(s));
    assert.deepEqual((await plan(s,uuid(1),{callsign:'OTHER'})).rows[0].event_booking_ids,[]);
    const p=await plan(s); assert.equal(p.rows[0].event_title,'Tokyo RFE'); assert.deepEqual(p.rows[0].event_booking_ids,[id]);
    assert.deepEqual((await plan(s)).rows[0].event_booking_ids,[]);
    await s.db.query("update plans_vol set statut='en_cours' where id=$1",[p.rows[0].id]);
    await assert.rejects(s.db.query('select manage_event_reservation($1,$2,$3)',[uuid(1),id,'cancel']),/déjà utilisée/);
    await s.db.query("update plans_vol set aeroport_arrivee='IPPH',deroutement_at=now() where id=$1",[p.rows[0].id]);
  }finally{await s.db.close();}
});
test('free ATC reservation keeps precedence over a major event reservation; adjacent slots are allowed',async()=>{
  const s=await setup();try{
    const free={event_id:null,role:'atc',airport:'ITKO',position:'Tower',starts_at:s.slot,ends_at:new Date(Date.parse(s.slot)+1800000).toISOString(),status:'confirmed'};
    const id=await reserve(s,uuid(1),free);
    await assert.rejects(reserve(s,uuid(2),{...free,event_id:s.id}),/déjà réservé/);
    assert.equal((await s.db.query('select user_id from event_reservations where id=$1',[id])).rows[0].user_id,uuid(1));
    await reserve(s,uuid(2),{...free,event_id:s.id,starts_at:free.ends_at,ends_at:new Date(Date.parse(free.ends_at)+600000).toISOString()});
    await assert.rejects(reserve(s,uuid(1),{...free,position:'Ground'}),/déjà réservé/);
  }finally{await s.db.close();}
});
test('capacity, waiting list and promotion are transactional',async()=>{
  const s=await setup();try{
    const a=await reserve(s,uuid(1),pilot(s));
    await assert.rejects(reserve(s,uuid(4),pilot(s,{callsign:'BAW456'})),/complet/);
    const b=await reserve(s,uuid(4),pilot(s,{callsign:'BAW456',status:'waitlisted'}));
    await assert.rejects(s.db.query('select manage_event_reservation($1,$2,$3)',[uuid(4),b,'promote']),/non autorisée/);
    await assert.rejects(s.db.query('select manage_event_reservation($1,$2,$3)',[uuid(3),b,'promote']),/complet/);
    await s.db.query('select manage_event_reservation($1,$2,$3)',[uuid(1),a,'cancel']);
    await s.db.query('select manage_event_reservation($1,$2,$3)',[uuid(3),b,'promote']);
    assert.equal((await s.db.query('select status from event_reservations where id=$1',[b])).rows[0].status,'confirmed');
  }finally{await s.db.close();}
});
test('ATC service is open without a reservation and never replaces a booked position',async()=>{
  const s=await setup();try{
    const start=new Date(Date.now()-60000).toISOString(); const end=new Date(Date.now()+1800000).toISOString();
    await s.db.query("insert into atc_sessions(user_id,aeroport,position) values($1,'ITKO','Tower')",[uuid(2)]);
    await s.db.query('delete from atc_sessions where user_id=$1',[uuid(2)]);
    await reserve(s,uuid(1),{event_id:null,role:'atc',airport:'ITKO',position:'Tower',starts_at:start,ends_at:end,status:'confirmed'});
    await assert.rejects(s.db.query("insert into atc_sessions(user_id,aeroport,position) values($1,'ITKO','Tower')",[uuid(2)]),/autre contrôleur/);
    await s.db.query("insert into atc_sessions(user_id,aeroport,position) values($1,'ITKO','Tower')",[uuid(1)]);
  }finally{await s.db.close();}
});
test('calendar structure is frozen after bookings and cancellation preserves history',async()=>{
  const s=await setup();try{
    await reserve(s,uuid(1),pilot(s));
    await assert.rejects(s.db.query('select save_major_calendar_event($1,$2,$3,$4)',[uuid(3),s.id,{...s.event,ends_at:new Date(Date.parse(s.end)+600000).toISOString()},s.config]),/verrouillés/);
    await s.db.query('select save_major_calendar_event($1,$2,$3,$4)',[uuid(3),s.id,s.event,{...s.config,enabled:false}]);
    assert.equal((await s.db.query('select status from event_reservations')).rows[0].status,'cancelled');
    await plan(s); // Restrictions levées après annulation.
  }finally{await s.db.close();}
});
test('authenticated clients cannot invoke privileged booking functions',async()=>{
  const s=await setup();try{await s.db.exec('set role authenticated');await assert.rejects(reserve(s,uuid(1),pilot(s)),/permission denied/);await s.db.exec('reset role');}finally{await s.db.close();}
});
test('a failed reservation change keeps the original ATC booking',async()=>{
  const s=await setup();try{
    const data={event_id:null,role:'atc',airport:'ITKO',position:'Tower',starts_at:s.slot,ends_at:new Date(Date.parse(s.slot)+1800000).toISOString(),status:'confirmed'};
    await reserve(s,uuid(1),data); const b=await reserve(s,uuid(2),{...data,position:'Ground'});
    await assert.rejects(s.db.query('select edit_event_slot($1,$2,$3)',[uuid(2),b,data]),/déjà réservé/);
    assert.equal((await s.db.query('select position from event_reservations where id=$1',[b])).rows[0].position,'Ground');
    await assert.rejects(s.db.query('select edit_event_slot($1,$2,$3)',[uuid(1),b,data]),/non autorisée/);
  }finally{await s.db.close();}
});
test('both airport movements count toward capacity; local flights cannot double-book a single slot',async()=>{
  const s=await setup();try{
    await s.db.query('select save_major_calendar_event($1,$2,$3,$4)',[uuid(3),s.id,s.event,{...s.config,airports:['ITKO','IRFD']}]);
    await reserve(s,uuid(1),pilot(s));
    const usage=(await s.db.query('select event_slot_usage($1) usage',[s.id])).rows[0].usage;
    assert.equal(usage.length,2); assert.ok(usage.every(row=>row.count===1));
    const time=new Date(Date.parse(s.slot)+1800000).toISOString();
    await assert.rejects(reserve(s,uuid(4),pilot(s,{airport:'IRFD',departure:'IRFD',arrival:'IPPH',callsign:'BAW456',starts_at:time,ends_at:new Date(Date.parse(time)+600000).toISOString(),departure_at:time})),/complet/);
  }finally{await s.db.close();}
  const s2=await setup();try{await assert.rejects(reserve(s2,uuid(1),pilot(s2,{arrival:'ITKO',duration_minutes:5})),/complet/);}finally{await s2.db.close();}
});
test('future event flights and unrelated airports remain open without reservations',async()=>{
  const s=await setup();try{
    const start=new Date(Date.now()+86400000).toISOString();const end=new Date(Date.parse(start)+7200000).toISOString();
    await s.db.query('select save_major_calendar_event($1,$2,$3,$4)',[uuid(3),s.id,{...s.event,starts_at:start,ends_at:end},s.config]);
    assert.deepEqual((await plan(s,uuid(1),{date:start})).rows[0].event_booking_ids,[]);
    await plan(s,uuid(1),{date:start,departure:'IPPH',arrival:'IRFD'});
  }finally{await s.db.close();}
});
