const { PGlite } = require('@electric-sql/pglite');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const id = n => `${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const actor=id(1), other=id(2), company=id(10), aircraft=id(20), personal=id(30), type=id(40), account=id(50);
const scope = changes => ({aeroport_depart:'IRFD',aeroport_arrivee:'ILAR',compagnie_id:company,compagnie_avion_id:aircraft,inventaire_avion_id:null,vol_commercial:true,vol_ferry:false,nature_transport:'passagers',...changes});
const draw = changes => ({nb_pax_genere:50,cargo_kg_genere:100,type_cargaison:'general',type_cargaison_libelle:null,cargo_bonus_percent:0,prix_billet_reference:100,prix_kg_reference:2,...changes});
async function setup() {
  const db=new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    CREATE TABLE profiles(id uuid primary key,role text);
    INSERT INTO profiles VALUES('${actor}','pilote'),('${other}','admin');
    CREATE TABLE compagnies(id uuid primary key,pdg_id uuid,prix_billet_pax numeric,prix_kg_cargo numeric,pourcentage_salaire numeric,alliance_id uuid);
    CREATE TABLE compagnie_employes(compagnie_id uuid,pilote_id uuid);
    CREATE TABLE inventaire_avions(id uuid primary key,proprietaire_id uuid,instruction_actif boolean default false,instruction_lifecycle text default 'brouillon',detruit boolean default false);
    CREATE TABLE types_avion(id uuid primary key,capacite_pax integer,capacite_cargo_kg integer);
    CREATE TABLE compagnie_avions(id uuid primary key,compagnie_id uuid,type_avion_id uuid,aeroport_actuel text,statut text,detruit boolean default false,bloque_incident boolean default false,usure_percent numeric default 100);
    CREATE TABLE compagnie_locations(id uuid primary key,avion_id uuid,loueur_compagnie_id uuid,locataire_compagnie_id uuid,statut text,start_at timestamptz,end_at timestamptz,last_billed_at timestamptz,prix_journalier integer,pourcentage_revenu_loueur integer);
    CREATE TABLE tarifs_liaisons(compagnie_id uuid,aeroport_depart text,aeroport_arrivee text,prix_billet numeric);
    CREATE TABLE aeroports(code_oaci text primary key,passagers_disponibles integer,passagers_max integer,cargo_disponible integer,cargo_max integer,updated_at timestamptz);
    CREATE TABLE taxes_aeroport(code_oaci text primary key,taxe_pourcent numeric);
    CREATE TABLE reparation_demandes(avion_id uuid,statut text);
    CREATE TABLE vols_ferry(avion_id uuid,statut text);
    CREATE TABLE alliance_parametres(alliance_id uuid,pret_avions_actif boolean);
    CREATE TABLE felitz_comptes(id uuid primary key,compagnie_id uuid,type text,solde numeric,created_at timestamptz default now());
    CREATE TABLE felitz_transactions(id uuid default gen_random_uuid(),compte_id uuid,type text,montant numeric,libelle text);
    CREATE TABLE plans_vol(id uuid primary key default gen_random_uuid(),pilote_id uuid,copilote_id uuid,compagnie_id uuid,compagnie_avion_id uuid,inventaire_avion_id uuid,numero_vol text CHECK(numero_vol<>'FAIL'),aeroport_depart text,aeroport_arrivee text,statut text,vol_commercial boolean,vol_ferry boolean,nature_transport text,nb_pax_genere integer,cargo_kg_genere integer,revenue_brut numeric,salaire_pilote numeric,prix_billet_utilise numeric,type_cargaison text,type_cargaison_libelle text,location_id uuid,location_loueur_compagnie_id uuid,location_pourcentage_revenu_loueur integer,location_prix_journalier integer,heure_depart_estimee timestamptz,created_at timestamptz default now(),current_holder_user_id uuid);
    INSERT INTO compagnies VALUES('${company}','${actor}',100,2,10,null);
    INSERT INTO types_avion VALUES('${type}',100,1000);
    INSERT INTO compagnie_avions VALUES('${aircraft}','${company}','${type}','IRFD','ground',false,false);
    INSERT INTO inventaire_avions(id,proprietaire_id) VALUES('${personal}','${actor}');
    INSERT INTO aeroports VALUES('IRFD',10000,10000,100000,100000,now()),('ILAR',10000,10000,100000,100000,now());
    INSERT INTO felitz_comptes VALUES('${account}','${company}','entreprise',100000);
    INSERT INTO taxes_aeroport VALUES('ILAR',0);
    CREATE FUNCTION public.consommer_passagers_aeroport(text,integer) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$SELECT $2$$;
    CREATE FUNCTION public.consommer_cargo(text,integer) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$SELECT $2$$;
  `);
  const sql=fs.readFileSync('supabase/flight_submission_integrity_20261029.sql','utf8');await db.exec(sql);await db.exec(sql);
  const staff=fs.readFileSync('supabase/logbook_staff_validation_20261029.sql','utf8');
  await db.exec(staff.match(/CREATE OR REPLACE FUNCTION public\.logbook_is_privileged_writer\(\)[\s\S]*?END \$\$;/)[0]);
  const access=fs.readFileSync('supabase/flight_plan_access_20261029.sql','utf8');await db.exec(access);await db.exec(access);
  return db;
}
test('flight submission: persistent draws, authorization, authoritative economy and atomic financial/stock writes',async t=>{
  const db=await setup();
  const rpc=async(sql,args)=>{await db.exec('SAVEPOINT rpc_call');try{const r=await db.query(sql,args);await db.exec('RELEASE SAVEPOINT rpc_call');return r;}catch(e){await db.exec('ROLLBACK TO SAVEPOINT rpc_call; RELEASE SAVEPOINT rpc_call');throw e;}};
  const quote=async(s=scope(),d=draw(),user=actor)=>(await rpc('SELECT get_flight_submission_quote($1,$2,$3) q',[user,s,d])).rows[0].q;
  const submit=async(q,s=scope(),changes={},user=actor)=>(await rpc('SELECT submit_flight_plan_integrity($1,$2,$3) p',[user,{...s,pilote_id:user,numero_vol:'AFR123',statut:'en_attente',heure_depart_estimee:new Date().toISOString(),...changes},q.quote_id])).rows[0].p;
  const scalar=async(sql)=>Number((await db.query(sql)).rows[0].n);
  const isolated=async(fn)=>{await db.exec('BEGIN');try{await fn();}finally{await db.exec('ROLLBACK');}};
  try {
    await t.test('repeated quote does not reroll cargo type, quantities or rarity',()=>isolated(async()=>{
      const first=await quote();const repeated=await quote(scope(),draw({nb_pax_genere:99,cargo_kg_genere:999,type_cargaison:'marchandise_rare',cargo_bonus_percent:30}));assert.deepEqual(repeated,first);
      assert.equal(first.revenue_brut,5200);assert.equal(first.salaire_pilote,520);
    }));
    await t.test('all company modes and personal ownership are authorized before a quote exists',()=>isolated(async()=>{
      await assert.rejects(quote(scope(),draw(),other),/appartenez/);
      await assert.rejects(quote(scope({vol_commercial:false,vol_ferry:true,nature_transport:null}),draw({nb_pax_genere:0,cargo_kg_genere:0}),other),/appartenez/);
      await assert.rejects(quote(scope({compagnie_id:null,compagnie_avion_id:null,inventaire_avion_id:personal,vol_commercial:false,nature_transport:null}),draw({nb_pax_genere:0,cargo_kg_genere:0}),other),/appartient/);
      assert.equal(await scalar('SELECT count(*)::int n FROM flight_submission_quotes'),0);
    }));
    await t.test('client PAX, money, salary and ticket injection is overwritten, stock reserved once, double submit rejected',()=>isolated(async()=>{
      const q=await quote();const p=await submit(q,scope(),{nb_pax_genere:999999,cargo_kg_genere:-500,revenue_brut:999999999,salaire_pilote:9999999,prix_billet_utilise:0});
      const stored=(await db.query('SELECT * FROM plans_vol WHERE id=$1',[p.id])).rows[0];assert.equal(stored.nb_pax_genere,50);assert.equal(stored.cargo_kg_genere,100);assert.equal(Number(stored.revenue_brut),5200);assert.equal(Number(stored.salaire_pilote),520);assert.equal(Number(stored.prix_billet_utilise),100);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),9950);
      await assert.rejects(submit(q),/déjà un plan/);
      assert.equal(await scalar('SELECT count(*)::int n FROM plans_vol'),1);
    }));
    await t.test('cancel restores exactly once and recreating keeps the draw; completed flight never restores',()=>isolated(async()=>{
      const q=await quote();const p=await submit(q);await db.query("UPDATE plans_vol SET statut='annule' WHERE id=$1",[p.id]);await db.query("UPDATE plans_vol SET statut='annule' WHERE id=$1",[p.id]);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),10000);
      assert.deepEqual(await quote(scope(),draw({nb_pax_genere:100})),q);
      const p2=await submit(q);await db.query("UPDATE plans_vol SET statut='cloture' WHERE id=$1",[p2.id]);await db.query("UPDATE plans_vol SET statut='annule' WHERE id=$1",[p2.id]);assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),9950);
    }));
    await t.test('tariffs and revenue are frozen with demand, preventing cheap quote then high ticket exploitation',()=>isolated(async()=>{
      await db.exec(`INSERT INTO tarifs_liaisons VALUES('${company}','IRFD','ILAR',0)`);
      await assert.rejects(quote(),/tarif a changé/);
      const q=await quote(scope(),draw({prix_billet_reference:0}));assert.equal(q.revenue_brut,200);assert.equal(q.prix_billet_utilise,0);
      await db.exec('UPDATE tarifs_liaisons SET prix_billet=9999');
      assert.deepEqual(await quote(scope(),draw({nb_pax_genere:100})),q);
      const p=await submit(q);assert.equal(Number((await db.query('SELECT revenue_brut FROM plans_vol WHERE id=$1',[p.id])).rows[0].revenue_brut),200);
    }));
    await t.test('refusal restores the load; resubmitting the same plan reserves it again and cannot bypass insufficient stock',()=>isolated(async()=>{
      const q=await quote();const p=await submit(q);
      await db.query("UPDATE plans_vol SET statut='refuse' WHERE id=$1",[p.id]);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),10000);
      await db.exec("UPDATE aeroports SET passagers_disponibles=1 WHERE code_oaci='IRFD'");
      await assert.rejects(rpc("UPDATE plans_vol SET statut='en_attente' WHERE id=$1",[p.id]),/Stock insuffisant/);
      assert.equal((await db.query('SELECT statut FROM plans_vol WHERE id=$1',[p.id])).rows[0].statut,'refuse');
      await db.exec("UPDATE aeroports SET passagers_disponibles=10000 WHERE code_oaci='IRFD'");
      await db.query("UPDATE plans_vol SET statut='en_attente' WHERE id=$1",[p.id]);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),9950);
      await db.query("UPDATE plans_vol SET statut='refuse' WHERE id=$1",[p.id]);
      await assert.rejects(rpc("UPDATE plans_vol SET statut='en_attente',aeroport_arrivee='IRFD' WHERE id=$1",[p.id]),/changer le trajet/);
    }));
    await t.test('leased aircraft billing credits the canonical lessor once with matching history and rolls back both sides on insertion error',()=>isolated(async()=>{
      const lessor=id(11),lessorAccount=id(51);
      await db.query('INSERT INTO compagnies VALUES($1,$2,100,2,10,null)',[lessor,other]);
      await db.query("INSERT INTO felitz_comptes(id,compagnie_id,type,solde) VALUES($1,$2,'entreprise',0)",[lessorAccount,lessor]);
      await db.query('UPDATE compagnie_avions SET compagnie_id=$1',[lessor]);
      await db.query("INSERT INTO compagnie_locations VALUES($1,$2,$3,$4,'active',now()-interval '2 days',now()+interval '10 days',now()-interval '2 days',100,10)",[id(70),aircraft,lessor,company]);
      const q=await quote();await assert.rejects(submit(q,scope(),{numero_vol:'FAIL'}),/check constraint/);
      assert.equal(await scalar(`SELECT solde n FROM felitz_comptes WHERE id='${lessorAccount}'`),0);
      assert.equal(await scalar(`SELECT solde n FROM felitz_comptes WHERE id='${account}'`),100000);
      await submit(q);assert.equal(await scalar(`SELECT solde n FROM felitz_comptes WHERE id='${lessorAccount}'`),200);
      assert.equal(await scalar(`SELECT solde n FROM felitz_comptes WHERE id='${account}'`),99800);
      assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'),2);
    }));
    await t.test('copilot confirmation does not reserve twice and refusal releases even before confirmation',()=>isolated(async()=>{
      await db.query('INSERT INTO compagnie_employes VALUES($1,$2)',[company,other]);
      const q=await quote();const p=await submit(q,scope(),{copilote_id:other,statut:'en_attente_copilote'});
      await db.query("UPDATE plans_vol SET statut='accepte' WHERE id=$1",[p.id]);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),9950);
      assert.equal((await db.query('SELECT statut FROM compagnie_avions WHERE id=$1',[aircraft])).rows[0].statut,'in_flight');
      await db.query("UPDATE plans_vol SET statut='annule' WHERE id=$1",[p.id]);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),10000);
      const p2=await submit(q,scope(),{copilote_id:other,statut:'en_attente_copilote'});
      await db.query("UPDATE plans_vol SET statut='annule' WHERE id=$1",[p2.id]);
      assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),10000);
    }));
    await t.test('direct authenticated plan writes cannot bypass the server, even with a forged service claim',()=>isolated(async()=>{
      const q=await quote();const p=await submit(q);
      await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated,service_role;GRANT SELECT ON profiles TO authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON plans_vol TO authenticated;');
      await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,role:'service_role'})]);
      await db.exec('SET LOCAL ROLE authenticated');
      await assert.rejects(rpc("UPDATE plans_vol SET revenue_brut=999999 WHERE id=$1",[p.id]),/commandes du site/);
      await assert.rejects(rpc('INSERT INTO plans_vol(pilote_id,numero_vol) VALUES($1,$2)',[actor,'FRAUD']),/commandes du site/);
      await assert.rejects(rpc('DELETE FROM plans_vol WHERE id=$1',[p.id]),/commandes du site/);
      await assert.rejects(rpc('SELECT submit_flight_plan_integrity($1,$2,$3)',[actor,{},q.quote_id]),/permission denied/);
      await assert.rejects(rpc("SELECT consommer_passagers_aeroport('IRFD',-999999)",[]),/permission denied/);
      await assert.rejects(rpc("SELECT consommer_cargo('IRFD',-999999)",[]),/permission denied/);
      await db.exec('RESET ROLE');
      assert.equal((await db.query("SELECT has_function_privilege('service_role','public.consommer_passagers_aeroport(text,integer)','EXECUTE') allowed")).rows[0].allowed,true);
      assert.equal(await scalar('SELECT count(*)::int n FROM plans_vol'),1);
    }));
    await t.test('insufficient stock cannot create a plan or partially reserve cargo',()=>isolated(async()=>{
      const q=await quote();await db.exec("UPDATE aeroports SET passagers_disponibles=1 WHERE code_oaci='IRFD'");await assert.rejects(submit(q),/Stock insuffisant/);assert.equal(await scalar('SELECT count(*)::int n FROM plans_vol'),0);assert.equal(await scalar("SELECT cargo_disponible n FROM aeroports WHERE code_oaci='IRFD'"),100000);
    }));
    await t.test('ferry rejection and insertion failure leave money and history untouched; zero staff tax remains zero',()=>isolated(async()=>{
      const s=scope({vol_commercial:false,vol_ferry:true,nature_transport:null});const q=await quote(s,draw({nb_pax_genere:0,cargo_kg_genere:0}));
      await db.exec("UPDATE compagnie_avions SET statut='maintenance'");await assert.rejects(submit(q,s),/indisponible/);await db.exec("UPDATE compagnie_avions SET statut='ground'");
      // Use a savepoint because PostgreSQL aborts the transaction on this deliberately failed INSERT.
      await db.exec('SAVEPOINT failed_insert');await assert.rejects(submit(q,s,{numero_vol:'FAIL'}),/check constraint/);await db.exec('ROLLBACK TO SAVEPOINT failed_insert');
      assert.equal(await scalar('SELECT solde n FROM felitz_comptes'),100000);assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'),0);
      await submit(q,s);assert.equal(await scalar('SELECT solde n FROM felitz_comptes'),90000);assert.equal(await scalar('SELECT count(*)::int n FROM felitz_transactions'),1);
    }));
    await t.test('concurrent submissions commit one plan and one stock reservation',async()=>{
      const q=(await db.query('SELECT get_flight_submission_quote($1,$2,$3) q',[actor,scope(),draw()])).rows[0].q;
      const p={...scope(),pilote_id:actor,numero_vol:'AFR123',statut:'en_attente'};
      const results=await Promise.allSettled([db.query('SELECT submit_flight_plan_integrity($1,$2,$3)',[actor,p,q.quote_id]),db.query('SELECT submit_flight_plan_integrity($1,$2,$3)',[actor,p,q.quote_id])]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(await scalar('SELECT count(*)::int n FROM plans_vol'),1);assert.equal(await scalar("SELECT passagers_disponibles n FROM aeroports WHERE code_oaci='IRFD'"),9950);
    });
  } finally {await db.close();}
});
