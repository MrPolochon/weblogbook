const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-5555-4555-8555-555555555555`;
const sql=fs.readFileSync('supabase/flight_reviews_20261030.sql','utf8');
async function setup(){
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE compagnies(id uuid PRIMARY KEY,nom text);
    CREATE TABLE plans_vol(id uuid PRIMARY KEY,compagnie_id uuid,vol_commercial boolean,statut text,cloture_at timestamptz,aeroport_arrivee text);
    CREATE TABLE flight_economy_settlements(plan_id uuid PRIMARY KEY,detail jsonb);
    CREATE TABLE economy_release_settings(id boolean,enabled boolean);
    INSERT INTO economy_release_settings VALUES(true,true);
    INSERT INTO compagnies VALUES('${id(1)}','Lufthansa'),('${id(2)}','Air Tahiti Nui');`);
  await db.exec(sql); await db.exec(sql);
  return db;
}
async function flight(db,n,{company=1,delay=0,settled=true,closed=true,wifi=false,diverted=false,completed=new Date().toISOString()}={}){
  await db.query('INSERT INTO plans_vol VALUES($1,$2,true,$3,$4,\'IRFD\')',[id(n),id(company),closed?'cloture':'en_cours',completed]);
  if(settled)await db.query('INSERT INTO flight_economy_settlements VALUES($1,$2)',[id(n),JSON.stringify({delay_minutes:delay,wifi_enabled:wifi,wifi_price:0,ife_level:1,diverted})]);
  await db.query('SELECT publish_flight_review($1)',[id(n)]);
}
test('public reviews describe only settled, closed flights and cannot be duplicated by retries',async()=>{
  const db=await setup();try{
    await flight(db,10,{settled:false});await flight(db,11,{closed:false});await flight(db,12,{wifi:true});
    await db.query('SELECT publish_flight_review($1)',[id(12)]);
    const {rows}=await db.query('SELECT * FROM flight_reviews');assert.equal(rows.length,1);
    assert.match(rows[0].body,/Lufthansa/);assert.match(rows[0].body,/Wi-Fi gratuit/);assert.equal(rows[0].rating,5);
    assert.equal(rows[0].simulation,true);assert.equal(rows[0].demand_percent,'0.25');
    await db.exec('UPDATE economy_release_settings SET enabled=false');await flight(db,13);assert.equal((await db.query('SELECT count(*)::int n FROM flight_reviews')).rows[0].n,1);
  }finally{await db.close();}
});
test('negative reviews reflect delay without inventing missed connections, reputation fades and stays company specific',async()=>{
  const db=await setup();try{
    await flight(db,20,{delay:75,diverted:true,completed:'2026-10-20T12:00:00Z'});
    await flight(db,21,{company:2,completed:'2026-10-20T12:00:00Z'});
    const review=(await db.query('SELECT body,rating FROM flight_reviews WHERE plan_id=$1',[id(20)])).rows[0];
    assert.match(review.body,/75 minutes/);assert.match(review.body,/déroutement/);assert.doesNotMatch(review.body,/correspondance/);assert.equal(review.rating,1);
    const reputation=async(company,date)=>Number((await db.query('SELECT flight_review_reputation($1,$2) n',[id(company),date])).rows[0].n);
    assert.equal(await reputation(1,'2026-10-20T12:00:00Z'),-2);
    assert.equal(await reputation(1,'2026-10-27T12:00:00Z'),-1);
    assert.equal(await reputation(1,'2026-11-03T12:00:00Z'),0);
    assert.equal(await reputation(2,'2026-10-20T12:00:00Z'),0.25);
    for(let n=30;n<40;n++)await flight(db,n,{delay:90,completed:'2026-10-20T12:00:00Z'});
    assert.equal(await reputation(1,'2026-10-20T12:00:00Z'),-8);
  }finally{await db.close();}
});
test('anonymous visitors can read safe feed fields but cannot identify source plans, forge reviews or call publishing RPC',async()=>{
  const db=await setup();try{
    await flight(db,50);await db.exec('SET ROLE anon');
    assert.equal((await db.query('SELECT body FROM flight_reviews')).rows.length,1);
    await assert.rejects(()=>db.query('SELECT plan_id,company_id,demand_percent FROM flight_reviews'),/permission denied/);
    await assert.rejects(()=>db.query('SELECT publish_flight_review($1)',[id(50)]),/permission denied/);
    await assert.rejects(()=>db.exec('DELETE FROM flight_reviews'),/permission denied/);
  }finally{await db.close();}
});
