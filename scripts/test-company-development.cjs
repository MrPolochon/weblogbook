const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-3333-4333-8333-333333333333`;
const actor=id(1),other=id(2),company=id(10),plane=id(20),type=id(30);
async function setup({limit=true}={}){
 const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE profiles(id uuid primary key,role text);INSERT INTO profiles VALUES('${actor}','pilote'),('${other}','pilote');
 CREATE TABLE compagnies(id uuid primary key,pdg_id uuid,pdg_user_id uuid,nom text);INSERT INTO compagnies VALUES('${company}','${actor}',null,'Compagnie');
 CREATE TABLE compagnie_employes(id uuid,compagnie_id uuid,pilote_id uuid,role text);
 CREATE TABLE types_avion(id uuid primary key,nom text,constructeur text,capacite_pax integer,capacite_cargo_kg integer,est_cargo boolean);INSERT INTO types_avion VALUES('${type}','A320','Airbus',100,1000,false);
 CREATE TABLE compagnie_avions(id uuid primary key,compagnie_id uuid,type_avion_id uuid,detruit boolean default false,aeroport_actuel text,immatriculation text,maintenance_fin_at timestamptz);INSERT INTO compagnie_avions VALUES('${plane}','${company}','${type}',false,'IRFD','F-TEST',null);
 CREATE TABLE compagnie_locations(id uuid,avion_id uuid,locataire_compagnie_id uuid,statut text,start_at timestamptz,end_at timestamptz);
 CREATE TABLE vols_ferry(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),compagnie_id uuid,avion_id uuid,aeroport_depart text,aeroport_arrivee text,statut text);
 CREATE TABLE compagnie_hubs(id uuid,compagnie_id uuid,aeroport_code text,est_hub_principal boolean);CREATE TABLE tarifs_liaisons(id uuid,compagnie_id uuid,aeroport_depart text,aeroport_arrivee text);
 CREATE TABLE felitz_comptes(id uuid primary key,compagnie_id uuid,type text,solde bigint,created_at timestamptz default now());INSERT INTO felitz_comptes(id,compagnie_id,type,solde) VALUES('${id(40)}','${company}','entreprise',1000000);
 CREATE TABLE felitz_transactions(id uuid default gen_random_uuid(),compte_id uuid,type text,montant bigint,libelle text,reference_id uuid);
 `);
 const sql=fs.readFileSync('supabase/company_development_20261030.sql','utf8');await db.exec(sql);await db.exec(sql);
 const corrections=fs.readFileSync('supabase/company_economy_corrections_20261030.sql','utf8');await db.exec(corrections);await db.exec(corrections);
 if(limit){const limitSql=fs.readFileSync('supabase/company_research_limit_20261030.sql','utf8');await db.exec(limitSql);await db.exec(limitSql);}
 await db.exec(`UPDATE economy_release_settings SET enabled=true,activated_at=now();
 INSERT INTO company_research_catalog(id,title,domain,description,unlock_key,cost,delay_seconds,prerequisites) VALUES('ROOT','Recherche','Domaine','Description','wifi',1000,3600,'{}'),('CHILD','Recherche suivante','Domaine','Description','wifi_free',2000,7200,'{ROOT}');
 INSERT INTO company_rse_catalog(id,title,domain,description,cost,delay_seconds,target_type,starter) SELECT 'CARD-'||n,'Carte '||n,'Domaine','Projet secret',100,3600,'compagnie',true FROM generate_series(1,25) n;
 INSERT INTO company_event_catalog(id,scenario_id,title,description,selector,effects,duration_days) VALUES('EVENT','SCENARIO','Aléa fictif','Inspection','constructeur:Airbus','{"inspection_required":true,"grounded":true}',5);`);
 return db;
}
const call=async(db,action,input,who=actor)=>(await db.query('SELECT company_development_action($1,$2,$3,$4) r',[who,company,action,input])).rows[0].r;
const dashboard=async(db)=>(await db.query('SELECT company_development_dashboard($1,$2) r',[actor,company])).rows[0].r;
const balance=async(db)=>Number((await db.query('SELECT solde FROM felitz_comptes')).rows[0].solde);
test('company development is persistent, paid, delayed and private',async t=>{
 const db=await setup();t.after(()=>db.close());
 await t.test('private catalogue and secret signer cannot be read or called by browser roles',async()=>{
  await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT * FROM company_rse_catalog'),/permission denied/);await assert.rejects(db.query('SELECT company_development_sign($1)',['x']),/permission denied/);await assert.rejects(db.query('SELECT company_development_guard_research_limit()'),/permission denied/);await db.exec('RESET ROLE');
  await assert.rejects(call(db,'research_start',{research_id:'ROOT',idempotency_key:id(100)},other),/PDG/);
  await db.query('UPDATE compagnies SET pdg_user_id=$1 WHERE id=$2',[other,company]);
  await assert.rejects(call(db,'research_start',{research_id:'ROOT',idempotency_key:id(100)},other),/PDG/);
  await db.exec('UPDATE compagnies SET pdg_user_id=NULL');
 });
 await t.test('hand is five, no outcomes or totals are exposed, discard cannot farm replacements',async()=>{
  const first=await dashboard(db);assert.equal(first.hand.length,5);assert.equal(first.research.length,1);assert.equal(first.research[0].id,'ROOT');assert.equal(first.commitments.length,0);assert.ok(!JSON.stringify(first.hand).includes('revenue_percent'));assert.ok(!('catalogue_count' in first));
  await call(db,'card_discard',{card_id:first.hand[0].id});assert.equal((await dashboard(db)).hand.length,4);
 });
 await t.test('research is debited once, prerequisite waits for completion, retries are idempotent',async()=>{
  const body={research_id:'ROOT',idempotency_key:id(101)};const before=await balance(db);const a=await call(db,'research_start',body),b=await call(db,'research_start',body);assert.deepEqual(a,b);assert.equal(await balance(db),before-1000);
  await assert.rejects(call(db,'research_start',{research_id:'CHILD',idempotency_key:id(102)}),/préalables/);
  const d=await dashboard(db);assert.equal(d.research.find(r=>r.id==='ROOT').status,'running');assert.ok(!d.research.some(r=>r.id==='CHILD'));
  await db.exec("UPDATE company_research_projects SET ready_at=now()-interval '1 second'");assert.ok((await dashboard(db)).research.some(r=>r.id==='CHILD'));
 });
 await t.test('RSE result appears only after debit, activation waits, permanent result survives retry',async()=>{
  const d=await dashboard(db);const body={card_id:d.hand[0].id,idempotency_key:id(103)};const before=await balance(db);const a=await call(db,'card_commit',body),b=await call(db,'card_commit',body);assert.deepEqual(a,b);assert.equal(await balance(db),before-100);assert.equal(a.signature.length,64);assert.equal(typeof a.revenue_percent,'number');
  const effects=(await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r;assert.equal(Number(effects.revenue_percent),0);
  await db.exec("UPDATE company_rse_commitments SET active_at=now()-interval '1 second'");const active=(await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r;assert.equal(Number(active.revenue_percent),a.revenue_percent);
 });
 await t.test('ledger failure rolls back company debit, commitment and monthly usage',async()=>{
  const d=await dashboard(db),before=await balance(db);await db.exec("CREATE FUNCTION fail_development_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'ledger unavailable';END$$;CREATE TRIGGER fail_development_ledger BEFORE INSERT ON felitz_transactions FOR EACH ROW EXECUTE FUNCTION fail_development_ledger();");
  await assert.rejects(call(db,'card_commit',{card_id:d.hand[0].id,idempotency_key:id(104)}),/ledger unavailable/);assert.equal(await balance(db),before);assert.equal((await dashboard(db)).monthly.used,1);await db.exec('DROP TRIGGER fail_development_ledger ON felitz_transactions');
 });
 await t.test('concurrent research retries create a single paid project',async()=>{
  const body={research_id:'CHILD',idempotency_key:id(105)},before=await balance(db);const results=await Promise.all([call(db,'research_start',body),call(db,'research_start',body)]);assert.deepEqual(results[0],results[1]);assert.equal(await balance(db),before-2000);
 });
 await t.test('monthly quota never accumulates or refills after consumption, and next month tops the hand up once',async()=>{
  let d=await dashboard(db);await db.exec('UPDATE company_development_cycles SET used=5');
  await assert.rejects(call(db,'card_commit',{card_id:d.hand[0].id,idempotency_key:id(106)}),/épuisés/);
  const retained=d.hand.map(c=>c.id);await db.exec("UPDATE company_development_cycles SET month=(date_trunc('month',now())-interval '1 month')::date");
  d=await dashboard(db);assert.equal(d.hand.length,5);assert.equal(d.monthly.used,0);assert.equal(d.monthly.remaining,5);assert.ok(retained.every(id=>d.hand.some(c=>c.id===id)));
  await call(db,'card_discard',{card_id:d.hand[0].id});assert.equal((await dashboard(db)).hand.length,4);
 });
 await t.test('service settings require completed unlocks and generic RP dossiers persist',async()=>{
  await assert.rejects(call(db,'settings',{settings:{wifi_enabled:true,wifi_price:0,seat_ratio:0.8,ife_level:3}}),/Recherche|recherche/);
  await db.exec("UPDATE company_research_projects SET ready_at=now()-interval '1 second'");
  await call(db,'settings',{settings:{wifi_enabled:true,wifi_price:0}});const d=await dashboard(db);assert.equal(d.services.settings.wifi_enabled,true);assert.equal(Number(d.services.settings.wifi_price),0);
  await assert.rejects(call(db,'settings',{settings:{wifi_price:1000}}),/limites/);
  await call(db,'dossier',{research_id:'ROOT',title:'Contrôle réseau',body:'Procédure réellement enregistrée',data:{checked:true}});
  assert.equal((await dashboard(db)).services.dossiers[0].title,'Contrôle réseau');
  await call(db,'settings',{settings:{wifi_enabled:false}});
 });
 await t.test('route and manufacturer selectors apply to the actual flight context',async()=>{
  assert.equal((await db.query('SELECT company_development_selector_matches_context($1,$2,$3,$4,$5,$6) r',['arrivee:ITKO',company,plane,'IRFD','ITKO','passagers'])).rows[0].r,true);
  assert.equal((await db.query('SELECT company_development_selector_matches_context($1,$2,$3,$4,$5,$6) r',['arrivee:ITKO',company,plane,'IRFD','ILAR','passagers'])).rows[0].r,false);
  assert.equal((await db.query('SELECT company_development_selector_matches_context($1,$2,$3,$4,$5,$6) r',['constructeur:Boeing',company,plane,'IRFD','ILAR','passagers'])).rows[0].r,false);
  await db.query("INSERT INTO compagnie_hubs VALUES($1,$2,'IRFD',true),($3,$2,'ITKO',false)",[id(400),company,id(401)]);
  assert.equal((await db.query('SELECT company_development_selector_matches_context($1,$2,$3,$4,$5,$6) r',['liaisons:hubs',company,plane,'IRFD','ITKO','passagers'])).rows[0].r,true);
  assert.equal((await db.query('SELECT company_development_selector_matches_context($1,$2,$3,$4,$5,$6) r',['liaisons:hubs',company,plane,'IRFD','ILAR','passagers'])).rows[0].r,false);
 });
 await t.test('one global event affects both companies; inspections remain until verified maintenance',async()=>{
  await db.query('INSERT INTO company_global_events(month,catalog_id,starts_at,ends_at,effects,selector,title,description) VALUES(date_trunc(\'month\',now())::date,$1,now()-interval \'1 day\',now()+interval \'1 day\',$2,$3,$4,$5) ON CONFLICT(month) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,effects=excluded.effects,selector=excluded.selector',['EVENT',{inspection_required:true,grounded:true},'constructeur:Airbus','Inspection','Inspection']);
  const effects=(await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r;assert.equal(effects.grounded,true);assert.equal(effects.inspection_required,true);
  await db.query('INSERT INTO compagnies VALUES($1,$2,null,$3)',[id(11),other,'Autre compagnie']);
  await db.query('INSERT INTO compagnie_avions VALUES($1,$2,$3,false,$4,$5,null)',[id(21),id(11),type,'IRFD','F-OTHER']);
  const second=(await db.query('SELECT company_development_dashboard($1,$2) r',[other,id(11)])).rows[0].r;assert.equal(second.global_event.title,(await dashboard(db)).global_event.title);
  assert.equal((await db.query('SELECT count(*)::integer n FROM company_global_events')).rows[0].n,1);
  assert.equal((await db.query('SELECT company_development_effects($1,$2) r',[id(11),id(21)])).rows[0].r.grounded,true);
  await db.exec("UPDATE company_global_events SET ends_at=now()-interval '1 second'");const still=(await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r;assert.equal(still.grounded,true);
  await db.query('SELECT company_development_complete_inspection($1,$2,now()-interval \'2 days\',now())',[plane,id(300)]);assert.equal((await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r.inspection_required,true);
  await db.query('SELECT company_development_complete_inspection($1,$2,now()-interval \'1 hour\',now())',[plane,id(301)]);assert.equal((await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r.inspection_required,false);
 });
 await t.test('codeshare requires bilateral leaders and cannot exceed the cumulative transfer cap',async()=>{
  const third=id(3),thirdCompany=id(12);await db.query('INSERT INTO profiles VALUES($1,$2)',[third,'pilote']);await db.query('INSERT INTO compagnies VALUES($1,$2,null,$3)',[thirdCompany,third,'Troisième compagnie']);
  await db.exec("INSERT INTO company_research_catalog(id,title,domain,description,unlock_key,cost,delay_seconds) VALUES('CS','Partenariats','Réseau','Contrats','codeshare',100,1)");
  for(const [c,who] of [[company,actor],[id(11),other],[thirdCompany,third]])await db.query("INSERT INTO company_research_projects(company_id,research_id,cost,ready_at,actor_id) VALUES($1,'CS',100,now()-interval '1 second',$2)",[c,who]);
  const first=await call(db,'codeshare_propose',{partner_id:id(11),share_percent:10}),second=await call(db,'codeshare_propose',{partner_id:thirdCompany,share_percent:10});
  await assert.rejects(call(db,'codeshare_accept',{agreement_id:first.id}),/partenaire/);
  const accept=(c,who,agreement)=>db.query('SELECT company_development_action($1,$2,$3,$4)',[who,c,'codeshare_accept',{agreement_id:agreement}]);
  const results=await Promise.allSettled([accept(id(11),other,first.id),accept(thirdCompany,third,second.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const effects=(await db.query('SELECT company_development_effects($1,$2) r',[company,plane])).rows[0].r;assert.equal(Number(effects.codeshare_percent),10);assert.equal(effects.codeshare_partners.length,1);assert.equal(Number(effects.codeshare_partners[0].percent),10);
 });
 await t.test('ordinary employees see services only; co-PDG may operate the management interface',async()=>{
  await db.query('INSERT INTO compagnie_employes VALUES($1,$2,$3,$4)',[id(500),company,other,'employe']);
  const ordinary=(await db.query('SELECT company_development_dashboard($1,$2) r',[other,company])).rows[0].r;assert.equal(ordinary.can_manage,false);assert.equal(ordinary.hand.length,0);assert.equal(ordinary.research.length,0);assert.equal(ordinary.commitments.length,0);
  await assert.rejects(call(db,'settings',{settings:{wifi_enabled:false}},other),/PDG/);
  await db.exec("UPDATE compagnie_employes SET role='co_pdg'");await call(db,'settings',{settings:{wifi_enabled:false}},other);
  assert.equal((await db.query('SELECT company_development_dashboard($1,$2) r',[other,company])).rows[0].r.can_manage,true);
 });
});

test('a company has at most three newly financed research projects running together',async t=>{
 const db=await setup();t.after(()=>db.close());
 await db.exec("INSERT INTO company_research_catalog(id,title,domain,description,unlock_key,cost,delay_seconds) SELECT 'LIMIT-'||n,'Projet '||n,'Domaine','Projet indépendant','limit_'||n,100,3600 FROM generate_series(1,7) n");
 const start=(n)=>call(db,'research_start',{research_id:`LIMIT-${n}`,idempotency_key:id(600+n)});
 const count=async(table)=>Number((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n);
 const running=async()=>Number((await db.query('SELECT count(*)::int n FROM company_research_projects WHERE company_id=$1 AND ready_at>now()',[company])).rows[0].n);
 const before=await balance(db);
 const first=await start(1);await start(2);
 const competing=await Promise.allSettled([start(3),start(4)]);
 assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
 const rejected=competing.find(result=>result.status==='rejected');assert.equal(rejected.reason.code,'23514');assert.equal(rejected.reason.constraint,'company_research_concurrency_limit');assert.match(rejected.reason.message,/Trois recherches/);
 assert.equal(await running(),3);assert.equal(await balance(db),before-300);
 assert.equal(await count('felitz_transactions'),3);assert.equal(await count('company_development_operations'),3);
 const deniedProject=competing[0].status==='rejected'?3:4;
 assert.equal((await db.query('SELECT count(*)::int n FROM company_development_operations WHERE token=$1',[id(600+deniedProject)])).rows[0].n,0);
 assert.deepEqual(await start(1),first);assert.equal(await balance(db),before-300);
 assert.equal(await count('felitz_transactions'),3);

 // Un projet achevé libère une place ; la confirmation refusée reste réutilisable.
 await db.exec("UPDATE company_research_projects SET ready_at=now()-interval '1 second' WHERE research_id='LIMIT-1'");
 await start(deniedProject);
 assert.equal(await running(),3);assert.equal(await count('company_research_projects'),4);
 assert.equal(await balance(db),before-400);assert.equal(await count('felitz_transactions'),4);
 // L'import d'un historique achevé ne consomme aucune place simultanée.
 await db.query("INSERT INTO company_research_projects(company_id,research_id,cost,ready_at,actor_id) VALUES($1,'LIMIT-5',100,now()-interval '1 second',$2)",[company,actor]);
 assert.equal(await running(),3);assert.equal(await count('company_research_projects'),5);
 await assert.rejects(start(6),error=>error.code==='23514');assert.equal(await balance(db),before-400);

 // La limite appartient à chaque compagnie, pas à l'ensemble du réseau.
 await db.query('INSERT INTO compagnies VALUES($1,$2,null,$3)',[id(70),other,'Recherche partenaire']);
 await db.query("INSERT INTO felitz_comptes(id,compagnie_id,type,solde) VALUES($1,$2,'entreprise',1000)",[id(71),id(70)]);
 await db.query('SELECT company_development_action($1,$2,$3,$4)',[other,id(70),'research_start',{research_id:'LIMIT-6',idempotency_key:id(706)}]);
 assert.equal((await db.query('SELECT count(*)::int n FROM company_research_projects WHERE company_id=$1 AND ready_at>now()',[id(70)])).rows[0].n,1);
 // Une insertion serveur groupée respecte aussi le plafond et échoue intégralement.
 await assert.rejects(db.query("INSERT INTO company_research_projects(company_id,research_id,cost,ready_at,actor_id) SELECT $1,'LIMIT-'||n,100,now()+interval '1 hour',$2 FROM generate_series(1,3) n",[id(70),other]),error=>error.code==='23514');
 assert.equal((await db.query('SELECT count(*)::int n FROM company_research_projects WHERE company_id=$1',[id(70)])).rows[0].n,1);
});

test('installing the research limit preserves older projects above the cap until places become free',async t=>{
 const db=await setup({limit:false});t.after(()=>db.close());
 await db.exec("INSERT INTO company_research_catalog(id,title,domain,description,unlock_key,cost,delay_seconds) SELECT 'LEGACY-'||n,'Ancien projet '||n,'Domaine','Projet indépendant','legacy_'||n,100,3600 FROM generate_series(1,5) n");
 await db.query("INSERT INTO company_research_projects(company_id,research_id,cost,ready_at,actor_id) SELECT $1,'LEGACY-'||n,100,now()+interval '1 hour',$2 FROM generate_series(1,4) n",[company,actor]);
 const before=await balance(db),original=(await db.query('SELECT * FROM company_research_projects ORDER BY research_id')).rows;
 const sql=fs.readFileSync('supabase/company_research_limit_20261030.sql','utf8');await db.exec(sql);await db.exec(sql);
 assert.deepEqual((await db.query('SELECT * FROM company_research_projects ORDER BY research_id')).rows,original);
 assert.equal(await balance(db),before);assert.equal((await db.query('SELECT count(*)::int n FROM felitz_transactions')).rows[0].n,0);
 const input={research_id:'LEGACY-5',idempotency_key:id(805)};
 await assert.rejects(call(db,'research_start',input),error=>error.code==='23514');assert.equal(await balance(db),before);
 await db.exec("UPDATE company_research_projects SET ready_at=now()-interval '1 second' WHERE research_id IN ('LEGACY-1','LEGACY-2')");
 await call(db,'research_start',input);assert.equal(await balance(db),before-100);
 assert.equal((await db.query('SELECT count(*)::int n FROM company_research_projects')).rows[0].n,5);
 assert.equal((await db.query('SELECT count(*)::int n FROM company_research_projects WHERE ready_at>now()')).rows[0].n,3);
});

test('actual flight activity governs passenger services and RSE while null activity retains the legacy aircraft fallback',async t=>{
 const db=await setup();t.after(()=>db.close());
 await db.query('INSERT INTO company_service_settings(company_id,wifi_enabled,wifi_price,ife_level) VALUES($1,true,0,3)',[company]);
 await db.exec("INSERT INTO company_rse_catalog(id,title,domain,description,cost,delay_seconds,target_type,activity) SELECT 'ACT-'||activity,activity,'Domaine','Projet',100,3600,'compagnie',activity FROM unnest(ARRAY['passagers','cargo','toutes']) activity");
 await db.query("INSERT INTO company_rse_hands(company_id,catalog_id,target_type,target_id,offer_month,status) SELECT $1,id,'compagnie',$1,date_trunc('month',now())::date,'committed' FROM company_rse_catalog WHERE id LIKE 'ACT-%'",[company]);
 await db.query("INSERT INTO company_rse_commitments(company_id,hand_id,catalog_id,target_type,target_id,cost,revenue_percent,active_at,signature) SELECT $1,h.id,h.catalog_id,'compagnie',$1,100,CASE c.activity WHEN 'passagers' THEN 1 WHEN 'cargo' THEN 2 ELSE 4 END,now()-interval '1 second','fixture' FROM company_rse_hands h JOIN company_rse_catalog c ON c.id=h.catalog_id WHERE h.catalog_id LIKE 'ACT-%'",[company]);
 const effects=async activity=>(await db.query("SELECT company_development_effects_for_flight($1,$2,now(),'IRFD','ITKO',$3) effects",[company,plane,activity])).rows[0].effects;
 const passenger=await effects('passagers'),cargo=await effects('cargo'),legacy=await effects(null);
 assert.equal(passenger.revenue_percent,6.6);assert.equal(passenger.wifi_enabled,true);assert.equal(passenger.ife_level,3);
 assert.equal(cargo.revenue_percent,6);assert.equal(cargo.wifi_enabled,false);assert.equal(cargo.ife_level,0);
 assert.equal(legacy.revenue_percent,6.6);assert.equal(legacy.wifi_enabled,true);
 await db.exec('UPDATE types_avion SET capacite_pax=0,est_cargo=true');
 const cargoLegacy=await effects(null);assert.equal(cargoLegacy.revenue_percent,6);assert.equal(cargoLegacy.wifi_enabled,false);
 // An explicit activity wins over airframe layout; an unknown activity never falls back.
 assert.equal((await effects('passagers')).revenue_percent,6.6);assert.equal((await effects('unknown')).revenue_percent,4);
 const before=(await db.query('SELECT * FROM company_rse_commitments ORDER BY id')).rows;
 const sql=fs.readFileSync('supabase/company_economy_corrections_20261030.sql','utf8');await db.exec(sql);
 assert.deepEqual((await db.query('SELECT * FROM company_rse_commitments ORDER BY id')).rows,before);assert.equal(await balance(db),1000000);
 await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT company_development_effects_for_flight($1,$2)',[company,plane]),/permission denied/);await db.exec('RESET ROLE');
});

test('new ferries respect grounding and persistent inspections before any payment while an already engaged ferry can finish',async t=>{
 const db=await setup();t.after(()=>db.close());
 const insert=async status=>(await db.query("INSERT INTO vols_ferry(compagnie_id,avion_id,aeroport_depart,aeroport_arrivee,statut) VALUES($1,$2,'IRFD','ITKO',$3) RETURNING id",[company,plane,status])).rows[0].id;
 const older=await insert('planned'),before=await balance(db);
 const event=(await db.query("INSERT INTO company_global_events(month,catalog_id,starts_at,ends_at,effects,selector,title,description) VALUES(date_trunc('month',now())::date,'EVENT',now()-interval '1 day',now()+interval '1 day','{\"grounded\":true}','constructeur:Airbus','Consigne','Essai') RETURNING id")).rows[0].id;
 for(const status of ['planned','in_progress'])await assert.rejects(insert(status),/immobilisé/);
 assert.equal((await db.query('SELECT count(*)::int n FROM vols_ferry')).rows[0].n,1);
 assert.equal(await balance(db),before);assert.equal((await db.query('SELECT count(*)::int n FROM felitz_transactions')).rows[0].n,0);
 await db.query("UPDATE vols_ferry SET statut='completed' WHERE id=$1",[older]);
 await assert.rejects(db.query("UPDATE vols_ferry SET statut='planned' WHERE id=$1",[older]),/immobilisé/);
 await db.query("UPDATE company_global_events SET effects='{\"inspection_required\":true,\"grounded\":true}' WHERE id=$1",[event]);
 await db.query('SELECT company_development_tick()');
 await db.query("UPDATE company_global_events SET ends_at=now()-interval '1 second' WHERE id=$1",[event]);
 await assert.rejects(insert('in_progress'),/Inspection technique obligatoire/);
 assert.equal(await balance(db),before);
 await db.query("SELECT company_development_complete_inspection($1,$2,now()-interval '1 hour',now())",[plane,id(950)]);
 assert.ok(await insert('in_progress'));
 assert.equal((await db.query('SELECT count(*)::int n FROM vols_ferry')).rows[0].n,2);
});
