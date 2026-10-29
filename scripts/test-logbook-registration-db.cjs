const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const pilot=id(1),other=id(2),admin=id(3),copilot=id(4),listPilot=id(5);

async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text NOT NULL);
 INSERT INTO profiles VALUES('${pilot}','pilote'),('${other}','pilote'),('${admin}','admin'),('${copilot}','pilote'),('${listPilot}','pilote');
 CREATE TABLE plans_vol(id uuid PRIMARY KEY,pilote_id uuid NOT NULL REFERENCES profiles(id),copilote_id uuid,statut text NOT NULL,siavi_avion_id uuid,armee_mission_id text,aeroport_depart text,aeroport_arrivee text,type_vol text,numero_vol text,temps_prev_min integer,accepted_at timestamptz,cloture_at timestamptz);
 CREATE TABLE vols(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pilote_id uuid NOT NULL REFERENCES profiles(id),copilote_id uuid,copilote_confirme_par_pilote boolean DEFAULT false,type_avion_id uuid NOT NULL,compagnie_id uuid,compagnie_libelle text NOT NULL,aeroport_depart text NOT NULL,aeroport_arrivee text NOT NULL,duree_minutes integer NOT NULL,depart_utc timestamptz NOT NULL,arrivee_utc timestamptz NOT NULL,type_vol text NOT NULL,instructeur_id uuid,instruction_type text,commandant_bord text NOT NULL,role_pilote text NOT NULL,callsign text,statut text NOT NULL DEFAULT 'en_attente',created_by_admin boolean NOT NULL DEFAULT false,created_by_user_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),future_default text NOT NULL DEFAULT 'preserved');`);
 return db;
}
function row(n,change={}){const departure=new Date(Date.UTC(2026,9,29,18,n)).toISOString();return {pilote_id:pilot,copilote_id:null,type_avion_id:id(20),compagnie_libelle:'Compagnie',aeroport_depart:'IRFD',aeroport_arrivee:'ILAR',duree_minutes:10,depart_utc:departure,arrivee_utc:new Date(Date.parse(departure)+600000).toISOString(),type_vol:'IFR',commandant_bord:'Pilote',role_pilote:'Pilote',callsign:'GRM'+n,statut:'en_attente',...change};}
async function plan(db,n,r,change={}){const p={id:id(100+n),pilote_id:r.pilote_id,statut:'cloture',aeroport_depart:r.aeroport_depart,aeroport_arrivee:r.aeroport_arrivee,type_vol:r.type_vol,numero_vol:r.callsign,temps_prev_min:10,accepted_at:r.depart_utc,cloture_at:r.arrivee_utc,siavi_avion_id:null,armee_mission_id:null,...change};const keys=Object.keys(p);await db.query(`INSERT INTO plans_vol(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(p));return p.id;}
async function save(db,r,p=null,actor=pilot){return (await db.query('SELECT register_logbook_flight($1,$2::jsonb,$3) result',[actor,JSON.stringify(r),p])).rows[0].result;}
async function list(db,p=pilot,limit=50){return (await db.query('SELECT * FROM get_unrecorded_closed_plans($1,$2)',[p,limit])).rows;}
async function direct(db,r,p=null){const value={...r,plan_vol_id:p};const keys=Object.keys(value);return db.query(`INSERT INTO vols(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id`,Object.values(value));}
async function count(db){return (await db.query('SELECT count(*)::int n FROM vols')).rows[0].n;}
async function processed(db,p){return (await db.query('SELECT logbook_processed_at FROM plans_vol WHERE id=$1',[p])).rows[0].logbook_processed_at;}

test('logbook registration is atomic and idempotent before any staff validation',async t=>{
 const db=await fixture();t.after(()=>db.close());
 // Deux véritables doublons hérités doivent survivre intégralement à la migration.
 const historical=row(1,{callsign:'HISTORY'});
 for(let n=0;n<2;n++){const keys=Object.keys(historical);await db.query(`INSERT INTO vols(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(historical));}
 const migration=fs.readFileSync('supabase/logbook_registration_20261029.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 assert.equal(await count(db),2);

 await t.test('simultaneous retries return one pending entry and preserve database defaults',async()=>{
  const r=row(2),p=await plan(db,2,r);
  const responses=await Promise.all([save(db,r,p),save(db,r,p),save(db,r,p)]);
  assert(responses.every(x=>x.ok));assert.equal(new Set(responses.map(x=>x.id)).size,1);
  assert.equal(responses.filter(x=>!x.duplicate).length,1);assert.equal(responses[0].statut,'en_attente');
  const saved=(await db.query('SELECT * FROM vols WHERE id=$1',[responses[0].id])).rows[0];
  assert.equal(saved.plan_vol_id,p);assert(saved.created_at&&saved.updated_at);assert.equal(saved.future_default,'preserved');assert(await processed(db,p));
  assert(!(await list(db)).some(x=>x.id===p));
 });

 await t.test('real military mission slugs are TEXT and stay excluded from the civil logbook',async()=>{
  const r=row(3),p=await plan(db,3,r,{armee_mission_id:'mission-ravitaillement'});
  assert.equal((await save(db,r,p)).code,'DEDICATED_MISSION');
  assert(!(await list(db)).some(x=>x.id===p));
 });

 await t.test('every existing staff or crew status counts as already registered',async()=>{
  const states=['en_attente','validé','refusé','en_attente_confirmation_copilote','en_attente_confirmation_instructeur','en_attente_confirmation_pilote','refuse_par_copilote'];
  for(const [i,state] of states.entries()){
   const r=row(5+i,{statut:state}),p=await plan(db,5+i,r);
   const first=await save(db,r,p,admin);assert(first.ok);
   const retry=await save(db,{...r,statut:'en_attente'},p);assert(retry.ok&&retry.duplicate);assert.equal(retry.id,first.id);assert.equal(retry.statut,state);
  }
 });

 await t.test('legacy exact matches hide pending entries without assigning or deleting history',async()=>{
  const p=await plan(db,30,historical);
  assert(!(await list(db)).some(x=>x.id===p));
  const before=await count(db),retry=await save(db,historical,p);
  assert(retry.ok&&retry.duplicate);assert.equal(await count(db),before);assert(await processed(db,p));
  assert.equal((await db.query("SELECT count(*)::int n FROM vols WHERE callsign='HISTORY'")).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM vols WHERE callsign='HISTORY' AND plan_vol_id IS NOT NULL")).rows[0].n,0);
 });

 await t.test('different dates remain legitimate, direct duplicate inserts and relinks are blocked',async()=>{
  const r=row(15),first=await save(db,r);assert(first.ok);
  const alternate={...r,depart_utc:'2026-10-30T18:15:00Z',arrivee_utc:'2026-10-30T18:25:00Z'};
  const second=await save(db,alternate);assert(second.ok);
  const otherRoute=await save(db,{...r,aeroport_depart:'ILAR',aeroport_arrivee:'IMLR'});assert(otherRoute.ok&&!otherRoute.duplicate);assert.notEqual(otherRoute.id,first.id);
  await assert.rejects(()=>direct(db,r),/déjà enregistré/);
  await assert.rejects(()=>db.query('UPDATE vols SET depart_utc=$2,arrivee_utc=$3 WHERE id=$1',[second.id,r.depart_utc,r.arrivee_utc]),/déjà enregistré/);
  const retry=await save(db,{...r,callsign:' grm 15 ',depart_utc:'2026-10-29T20:15:45+02:00'});assert(retry.ok&&retry.duplicate);assert.equal(retry.id,first.id);
 });

 await t.test('unauthorized, inactive, dedicated and discarded sources cause no insertion or marking',async()=>{
  const r=row(20),foreign=await plan(db,40,r,{pilote_id:other});
  const before=await count(db);assert.equal((await save(db,r,foreign)).code,'SOURCE_NOT_OWNED');assert.equal(await processed(db,foreign),null);
  const open=await plan(db,41,r,{statut:'accepte'});assert.equal((await save(db,r,open)).code,'SOURCE_NOT_CLOSED');assert.equal(await processed(db,open),null);
  const medical=await plan(db,42,r,{siavi_avion_id:id(90)});assert.equal((await save(db,r,medical)).code,'DEDICATED_MISSION');
  const military=await plan(db,43,r,{armee_mission_id:id(91)});assert.equal((await save(db,r,military)).code,'DEDICATED_MISSION');
  await db.exec('CREATE TABLE siavi_rapports_medevac(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_vol_id uuid NOT NULL REFERENCES plans_vol(id))');
  const medicalWithoutAircraft=await plan(db,49,r);
  await db.query('INSERT INTO siavi_rapports_medevac(plan_vol_id) VALUES($1)',[medicalWithoutAircraft]);
  assert(!(await list(db)).some(p=>p.id===medicalWithoutAircraft));
  assert.equal((await save(db,r,medicalWithoutAircraft)).code,'DEDICATED_MISSION');assert.equal(await processed(db,medicalWithoutAircraft),null);
  await assert.rejects(()=>direct(db,r,medicalWithoutAircraft),/espace dédié/);
  const discarded=await plan(db,44,r);await db.query('UPDATE plans_vol SET logbook_processed_at=now() WHERE id=$1',[discarded]);assert.equal((await save(db,r,discarded)).code,'SOURCE_PROCESSED');
  assert.equal((await save(db,{...r,pilote_id:other},null,pilot)).code,'ACTOR_NOT_CREW');
  assert.equal((await save(db,{...r,statut:'validé'})).code,'STAFF_VALIDATION_REQUIRED');
  assert.equal(await count(db),before);
 });

 await t.test('a real booked copilot may register but a caller cannot invent source crew membership',async()=>{
  const r=row(26,{copilote_id:copilot,statut:'en_attente_confirmation_pilote'}),p=await plan(db,47,r);
  assert.equal((await save(db,r,p,copilot)).code,'SOURCE_NOT_CREW');assert.equal(await processed(db,p),null);
  await db.query('UPDATE plans_vol SET copilote_id=$2 WHERE id=$1',[p,copilot]);
  const result=await save(db,r,p,copilot);assert(result.ok);assert.equal(result.statut,'en_attente_confirmation_pilote');
 });

 await t.test('duplicate data cannot mark a different selected plan as processed',async()=>{
  const r=row(22),saved=await save(db,r);assert(saved.ok);
  const p=await plan(db,45,row(23));
  const retry=await save(db,r,p);assert.equal(retry.code,'SOURCE_MISMATCH');assert.equal(await processed(db,p),null);
 });

 await t.test('a forged copilot cannot discover an existing entry through an exact fingerprint retry',async()=>{
  const r=row(36,{pilote_id:other}),original=await save(db,r,null,other);assert(original.ok);
  const before=await count(db);
  const falseCrew=await save(db,{...r,copilote_id:copilot,role_pilote:'Co-pilote',statut:'en_attente_confirmation_pilote'},null,copilot);
  assert.equal(falseCrew.ok,false);assert.equal(falseCrew.status,409);assert.equal(falseCrew.code,'EXISTING_CREW_REQUIRED');
  assert(!Object.hasOwn(falseCrew,'id'));assert(!Object.hasOwn(falseCrew,'statut'));assert.equal(await count(db),before);
  const realRow=row(37,{pilote_id:other,copilote_id:copilot}),realOriginal=await save(db,realRow,null,other);assert(realOriginal.ok);
  const realRetry=await save(db,{...realRow,role_pilote:'Co-pilote'},null,copilot);
  assert(realRetry.ok&&realRetry.duplicate);assert.equal(realRetry.id,realOriginal.id);assert.equal(realRetry.statut,realOriginal.statut);
 });

 await t.test('linked pending and refused entries remain editable while duplicate corrections are rejected',async()=>{
  const r=row(28),p=await plan(db,48,r),saved=await save(db,r,p);assert(saved.ok);
  await db.query("UPDATE vols SET callsign='CORR28' WHERE id=$1",[saved.id]);
  await db.query("UPDATE vols SET statut='refusé' WHERE id=$1",[saved.id]);
  await db.query("UPDATE vols SET aeroport_arrivee='IMLR',statut='en_attente' WHERE id=$1",[saved.id]);
  const colliding=await save(db,{...r,callsign:'OTHER28',aeroport_arrivee:'IMLR'});assert(colliding.ok);
  await assert.rejects(()=>db.query("UPDATE vols SET callsign='OTHER28' WHERE id=$1",[saved.id]),/déjà enregistré/);
  await db.query("UPDATE vols SET statut='validé' WHERE id=$1",[saved.id]);
  const record=(await db.query('SELECT statut,plan_vol_id,callsign,aeroport_arrivee FROM vols WHERE id=$1',[saved.id])).rows[0];
  assert.equal(record.statut,'validé');assert.equal(record.plan_vol_id,p);assert.equal(record.callsign,'CORR28');assert.equal(record.aeroport_arrivee,'IMLR');assert(await processed(db,p));
 });

 await t.test('a marking failure rolls the insertion back, including direct inserts',async()=>{
  const r=row(24),p=await plan(db,46,r),before=await count(db);
  await db.exec(`CREATE FUNCTION fail_mark() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id='${p}' THEN RAISE EXCEPTION 'mark failure'; END IF;RETURN NEW;END$$;CREATE TRIGGER fail_mark BEFORE UPDATE ON plans_vol FOR EACH ROW EXECUTE FUNCTION fail_mark();`);
  await assert.rejects(()=>save(db,r,p),/mark failure/);assert.equal(await count(db),before);assert.equal(await processed(db,p),null);
  await assert.rejects(()=>direct(db,r,p),/mark failure/);assert.equal(await count(db),before);
  await db.exec('DROP TRIGGER fail_mark ON plans_vol;DROP FUNCTION fail_mark();');
 });

 await t.test('listing excludes before its limit and exposes the complete available count',async()=>{
  for(let n=0;n<55;n++){const r=row(60+n,{pilote_id:listPilot,callsign:'LIST'+n});await plan(db,100+n,r);}
  for(let n=0;n<5;n++){const r=row(130+n,{pilote_id:listPilot,callsign:'RECORDED'+n});const p=await plan(db,200+n,r);assert((await save(db,r,p,listPilot)).ok);}
  const result=await list(db,listPilot,1);assert.equal(result.length,1);assert.equal(Number(result[0].available_count),55);assert.equal(result[0].temps_prev_min,10);
  assert.equal((await list(db,listPilot,50)).length,50);
 });

 await t.test('ordinary RLS-approved direct writes keep working and cannot bypass duplicate guards',async()=>{
  await db.exec(`GRANT SELECT,INSERT,UPDATE ON vols TO authenticated;ALTER TABLE vols ENABLE ROW LEVEL SECURITY;CREATE POLICY own_logbook ON vols FOR ALL TO authenticated USING(pilote_id='${pilot}') WITH CHECK(pilote_id='${pilot}');SET ROLE authenticated;`);
  const r=row(35),saved=await direct(db,r);assert(saved.rows[0].id);
  await db.query("UPDATE vols SET callsign='RLS35' WHERE id=$1",[saved.rows[0].id]);
  await assert.rejects(()=>direct(db,{...r,callsign:'RLS35'}),/déjà enregistré/);
  await assert.rejects(()=>direct(db,{...r,pilote_id:other,callsign:'RLS-OTHER'}),/row-level security/);
  await db.exec('RESET ROLE');
 });

 await t.test('public browser roles cannot call privileged registration or listing RPCs',async()=>{
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   await assert.rejects(()=>save(db,row(33)),/permission denied/);
   await assert.rejects(()=>list(db),/permission denied/);
   await assert.rejects(()=>db.query('SELECT logbook_registration_is_dedicated($1,NULL,NULL)',[id(149)]),/permission denied/);
   await db.exec('RESET ROLE');
  }
 });
});
