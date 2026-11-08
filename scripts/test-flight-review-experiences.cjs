const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-9999-4999-8999-999999999999`;
const style=fs.readFileSync('supabase/company_flight_review_style_20261030.sql','utf8');
async function setup(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
CREATE TABLE profiles(id uuid PRIMARY KEY,role text);INSERT INTO profiles VALUES('${id(1)}','admin'),('${id(2)}','pilote');
CREATE TABLE compagnies(id uuid PRIMARY KEY,nom text);INSERT INTO compagnies VALUES('${id(3)}','Lufthansa');
CREATE TABLE types_avion(id uuid PRIMARY KEY,nom text);INSERT INTO types_avion VALUES('${id(4)}','Boeing 777');
CREATE TABLE plans_vol(id uuid PRIMARY KEY,compagnie_id uuid,vol_commercial boolean DEFAULT true,statut text DEFAULT 'cloture',cloture_at timestamptz DEFAULT now(),aeroport_arrivee text DEFAULT 'ITKO',aeroport_depart text DEFAULT 'IRFD',numero_vol text DEFAULT 'DLH500',type_avion_id uuid DEFAULT '${id(4)}',economy_version integer DEFAULT 2,nb_pax_genere integer DEFAULT 400,cargo_kg_genere numeric DEFAULT 6000,nature_transport text DEFAULT 'passagers',accepted_at timestamptz DEFAULT now()-interval '18 minutes',heure_depart_estimee timestamptz DEFAULT now()-interval '18 minutes',temps_prev_min integer DEFAULT 18,deroutement_at timestamptz);
CREATE TABLE flight_economy_settlements(plan_id uuid PRIMARY KEY,detail jsonb);
CREATE TABLE economy_release_settings(id boolean,enabled boolean);INSERT INTO economy_release_settings VALUES(true,true);
CREATE TABLE felitz_comptes(id uuid PRIMARY KEY,solde integer);INSERT INTO felitz_comptes VALUES('${id(5)}',123456);
`);await db.exec(fs.readFileSync('supabase/flight_reviews_20261030.sql','utf8'));await db.exec(fs.readFileSync('supabase/company_flight_review_batches_20261030.sql','utf8'));return db;}
const getRows=async(db,n)=>(await db.query('SELECT * FROM flight_reviews WHERE plan_id=$1 ORDER BY review_sequence',[id(n)])).rows;
async function addFlight(db,n,{legacy=false,cargo=false,delay=0,wifi=false}={}){await db.query('INSERT INTO plans_vol(id,compagnie_id,economy_version,nature_transport,nb_pax_genere,cargo_kg_genere) VALUES($1,$2,$3,$4,$5,$6)',[id(n),id(3),legacy?1:2,cargo?'cargo':'passagers',cargo?0:400,cargo?100000:6000]);if(!legacy)await db.query('INSERT INTO flight_economy_settlements VALUES($1,$2)',[id(n),{delay_minutes:delay,wifi_enabled:wifi,wifi_price:0,ife_level:wifi?2:0,diverted:false}]);}
const renderAll=async(db,n,detail={delay_minutes:0})=>(await db.query('SELECT public.render_flight_review_voice(to_jsonb(p),$2,s.i) r FROM plans_vol p CROSS JOIN generate_series(1,30) s(i) WHERE p.id=$1 ORDER BY s.i',[id(n),detail])).rows.map(x=>x.r);

const experience=fs.readFileSync('supabase/company_flight_review_experiences_20261030.sql','utf8');
const realism=fs.readFileSync('supabase/flight_review_realism_20261104.sql','utf8');

test('the AI worker accepts a complete grounded batch and rejects omitted partners or duplicate voices', async () => {
  const ts = require('typescript');
  const source = ts.transpileModule(fs.readFileSync('src/lib/flight-review-ai.ts','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const drafts = [
    { sequence:1, rating:4, topic:'network', observation:'Un accord avec St Barth Commuter.', network_name:'St Barth Commuter' },
    { sequence:2, rating:3, topic:'timing', observation:'Départ en retard.' },
  ];
  const texts = {1:'Je regarderai les liaisons de St Barth Commuter la prochaine fois.',2:'Ce retard m’a obligé à décaler ce que j’avais prévu.'};
  const request = async (url, init) => {
    assert.equal(url,'https://example.invalid/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.response_format.type,'json_object');
    assert.deepEqual(JSON.parse(body.messages[1].content).drafts,drafts);
    return { ok:true, json:async () => ({ choices:[{ message:{ content:JSON.stringify(texts) } }] }) };
  };
  new Function('require','exports','fetch',source)(
    name => name==='@/lib/support/llm' ? { buildAttempts:()=>[{base:'https://example.invalid/v1',key:'test',model:'test'}] } : {},
    loaded.exports,request,
  );
  assert.deepEqual(await loaded.exports.rewriteFlightReviews({drafts}),texts);
  assert.equal(loaded.exports.parseReviewRewrites(JSON.stringify({...texts,1:texts[2]}),drafts),null);
  assert.equal(loaded.exports.parseReviewRewrites(JSON.stringify({...texts,2:texts[1]}),drafts),null);
});

test('a settled flight uses frozen offerings and AI can replace only its published texts', async () => {
  const db = await setup();
  try {
    await db.exec(`
      ALTER TABLE plans_vol ADD COLUMN economy_snapshot jsonb, ADD COLUMN company_itinerary_leg_id uuid;
      ALTER TABLE compagnies ADD COLUMN alliance_id uuid;
      CREATE TABLE alliances(id uuid PRIMARY KEY, nom text);
      CREATE TABLE company_service_settings(company_id uuid PRIMARY KEY, service_flags jsonb);
      CREATE TABLE company_research_projects(company_id uuid, research_id text, ready_at timestamptz);
      CREATE TABLE company_research_catalog(id text, unlock_key text);
      CREATE TABLE flight_submission_quotes(scope jsonb, economy_snapshot jsonb, pricing jsonb);
      CREATE TABLE company_itinerary_legs(id uuid, itinerary_id uuid, leg_index integer, destination text, status text);
      CREATE FUNCTION company_development_is_leader(uuid,uuid) RETURNS boolean LANGUAGE sql AS 'SELECT $1 = ''${id(1)}''::uuid';
      CREATE FUNCTION company_development_has_unlock(uuid,text) RETURNS boolean LANGUAGE sql AS
        'SELECT EXISTS(SELECT 1 FROM company_research_projects r JOIN company_research_catalog c ON c.id=r.research_id WHERE r.company_id=$1 AND c.unlock_key=$2 AND r.ready_at<=now())';
      INSERT INTO alliances VALUES ('${id(7)}','One World');
      UPDATE compagnies SET alliance_id='${id(7)}' WHERE id='${id(3)}';
      INSERT INTO compagnies VALUES ('${id(8)}','St Barth Commuter',NULL),('${id(9)}','British Airways','${id(7)}');
      INSERT INTO company_service_settings VALUES ('${id(3)}','{"restauration":true,"bagages":true,"correspondance":true}');
      INSERT INTO company_research_catalog VALUES ('r1','restauration'),('r2','bagages'),('r3','correspondance');
      INSERT INTO company_research_projects VALUES ('${id(3)}','r1',now()),('${id(3)}','r2',now()+interval '1 day'),('${id(3)}','r3',now());
      INSERT INTO flight_submission_quotes VALUES ('{"compagnie_id":"${id(3)}"}',NULL,'{}');
      INSERT INTO company_itinerary_legs VALUES ('${id(41)}','${id(40)}',1,'ITKO','completed'),('${id(42)}','${id(40)}',2,'IPPH','planned');
    `);
    await db.exec(style);
    await db.exec(experience);
    await db.exec(realism);
    await db.exec(realism);
    await assert.rejects(db.query('SELECT save_company_review_preferences($1,$2,$3,$4)', [id(2),id(3),'short','network']), /direction/);
    await db.query('SELECT save_company_review_preferences($1,$2,$3,$4)', [id(1),id(3),'short','network']);
    const snapshot = (await db.query('UPDATE flight_submission_quotes SET economy_snapshot=$1 RETURNING economy_snapshot,pricing', [{
      wifi_enabled:true,wifi_price:0,ife_level:3,seat_ratio:.8,
      codeshare_partners:[{company_id:id(8)}],alliance_terms:{partners:[{company_id:id(9)}]},
    }])).rows[0];
    assert.deepEqual(snapshot.pricing.economy_snapshot, snapshot.economy_snapshot);
    const offering = snapshot.economy_snapshot.review_offering;
    assert.equal(offering.meal,true);
    assert.equal(offering.bags,false);
    assert.equal(offering.assistance,true);
    assert.deepEqual(offering.partners,['St Barth Commuter']);
    assert.deepEqual(offering.alliance_partners,['British Airways']);
    assert.equal(offering.alliance,'One World');
    await db.exec("UPDATE company_service_settings SET service_flags='{}'");
    await addFlight(db, 75, {delay:22});
    await db.query('UPDATE plans_vol SET economy_snapshot=$1,company_itinerary_leg_id=$2 WHERE id=$3', [snapshot.economy_snapshot,id(41),id(75)]);
    await db.query('SELECT publish_flight_review($1)', [id(75)]);
    const before = await getRows(db,75);
    assert.ok(before[0].body.includes('22 min'));
    assert.match(before[1].body,/St Barth Commuter/);
    assert.equal(Number(before.reduce((sum, r) => sum + Number(r.demand_percent), 0).toFixed(6)), -.5);
    const job = (await db.query('SELECT * FROM claim_flight_review_rewrites(true)')).rows[0];
    assert.equal(job.payload.voice,'short');
    assert.equal(job.payload.next_stop,'IPPH');
    assert.equal((await db.query('SELECT * FROM claim_flight_review_rewrites(true)')).rows.length,0);
    const texts = Object.fromEntries(before.map(r=>[r.review_sequence,`Voici mon avis simulé sur le vol, numéro ${r.review_sequence}.`]));
    assert.equal((await db.query('SELECT finish_flight_review_rewrite($1,0,$2) ok',[id(75),texts])).rows[0].ok,false);
    assert.equal((await db.query('SELECT finish_flight_review_rewrite($1,1,$2) ok',[id(75),{}])).rows[0].ok,false);
    assert.equal((await db.query('SELECT finish_flight_review_rewrite($1,1,$2) ok',[id(75),texts])).rows[0].ok,true);
    assert.deepEqual(await getRows(db,75),before.map(r=>({...r,body:texts[r.review_sequence]})));
    await db.query('SELECT publish_flight_review($1)', [id(75)]);
    assert.equal((await db.query('SELECT * FROM claim_flight_review_rewrites(true)')).rows.length,0);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM claim_flight_review_rewrites(true)'), /permission denied/);
  } finally { await db.close(); }
});
test('ratings and passenger topics vary, honor snapshots, and exclude amenities from cargo',async()=>{const db=await setup();try{
await db.exec('ALTER TABLE plans_vol ADD COLUMN economy_snapshot jsonb');await db.exec(style);await db.exec(experience);await db.exec(experience);
await addFlight(db,70);await db.query('UPDATE plans_vol SET economy_snapshot=$1 WHERE id=$2',[{wifi_enabled:false,seat_ratio:1,ife_level:0},id(70)]);
const rows=await renderAll(db,70);assert.equal(new Set(rows.map(r=>r.body)).size,30);assert.ok(rows.some(r=>r.rating===3));assert.ok(rows.some(r=>r.rating===4));assert.ok(rows.some(r=>r.rating===5));assert.ok(rows[0].rating<5);assert.ok(rows.some(r=>/absence de Wi-Fi|Pas de Wi-Fi|n’était pas proposé/.test(r.body)));assert.ok(rows.some(r=>/sièges/.test(r.body)));assert.ok(rows.some(r=>/divertissement/.test(r.body)));
await db.query('UPDATE plans_vol SET economy_snapshot=$1 WHERE id=$2',[{wifi_enabled:true,wifi_price:0,seat_ratio:.8,ife_level:3},id(70)]);const good=await renderAll(db,70,{delay_minutes:0,wifi_enabled:true,wifi_price:0,ife_level:3});assert.ok(good.every(r=>!/absence de Wi-Fi|Pas de Wi-Fi|n’était pas proposé|Aucun programme/.test(r.body)));assert.ok(good.some(r=>/Wi-Fi gratuit/.test(r.body)));assert.ok(good.some(r=>/plus d’espace/.test(r.body)));
await addFlight(db,71,{cargo:true});const freight=await renderAll(db,71);assert.ok(freight.every(r=>!/Wi-Fi|siège|divertissement/.test(r.body)));
}catch(e){throw e;}finally{await db.close();}});
test('refresh preserves count, IDs, money, weights and markers and retries are stable',async()=>{const db=await setup();try{await db.exec('ALTER TABLE plans_vol ADD COLUMN economy_snapshot jsonb');await db.exec(style);await addFlight(db,72);await db.query('SELECT publish_flight_review($1)',[id(72)]);const before=await getRows(db,72),plan=(await db.query('SELECT to_jsonb(p) p FROM plans_vol p WHERE id=$1',[id(72)])).rows[0].p;await db.exec(experience);assert.deepEqual(await getRows(db,72),before);await assert.rejects(db.query('SELECT refresh_flight_review_experiences($1,$2)',[id(2),id(72)]),/administrateurs/);await db.query('SELECT refresh_flight_review_experiences($1,$2)',[id(1),id(72)]);const after=await getRows(db,72);const clean=rows=>rows.map(({body,author_label,rating,sentiment,...rest})=>rest);assert.deepEqual(clean(after),clean(before));assert.deepEqual((await db.query('SELECT to_jsonb(p) p FROM plans_vol p WHERE id=$1',[id(72)])).rows[0].p,plan);assert.ok(after.some(r=>r.rating<5));assert.equal((await db.query('SELECT refresh_flight_review_experiences($1,$2) r',[id(1),id(72)])).rows[0].r.rewritten_count,0);await addFlight(db,73);await db.query('SELECT publish_flight_review($1)',[id(73)]);assert.ok((await getRows(db,73)).some(r=>r.rating<5));await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT refresh_flight_review_experiences($1,$2)',[id(1),id(72)]),/permission denied/);
}finally{await db.close();}});
