const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-6666-4666-8666-666666666666`;
async function setup(){const db=new PGlite();await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE compagnie_avions(id uuid PRIMARY KEY,compagnie_id uuid,statut text,usure_percent int,maintenance_fin_at timestamptz,detruit boolean DEFAULT false,bloque_incident boolean DEFAULT false,immatriculation text);
CREATE TABLE compagnie_locations(avion_id uuid,locataire_compagnie_id uuid,statut text,start_at timestamptz,end_at timestamptz);
CREATE TABLE plans_vol(compagnie_avion_id uuid,statut text);
CREATE TABLE reparation_demandes(id uuid PRIMARY KEY,compagnie_id uuid,avion_id uuid,statut text,debut_reparation_at timestamptz,fin_reparation_at timestamptz,prix_total int);
CREATE TABLE felitz_comptes(id uuid PRIMARY KEY,compagnie_id uuid,type text,solde int,created_at timestamptz DEFAULT now());
CREATE TABLE felitz_transactions(compte_id uuid,type text,montant int,libelle text,reference_id uuid);
CREATE TABLE inspection_calls(aircraft uuid,repair uuid,started timestamptz,completed timestamptz);
CREATE TABLE test_effects(data jsonb);INSERT INTO test_effects VALUES('{}');
CREATE FUNCTION logbook_is_privileged_writer() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('role')<>'authenticated' $$;
CREATE FUNCTION company_development_is_leader(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${id(1)}' AND $2='${id(2)}' $$;
CREATE FUNCTION company_development_effects(uuid,uuid,timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE sql AS $$ SELECT data FROM test_effects $$;
CREATE FUNCTION company_development_complete_inspection(uuid,uuid,timestamptz,timestamptz) RETURNS void LANGUAGE sql AS $$ INSERT INTO inspection_calls VALUES($1,$2,$3,$4) $$;
INSERT INTO compagnie_avions(id,compagnie_id,statut,usure_percent,immatriculation) VALUES('${id(3)}','${id(2)}','bloque',0,'F-TEST');
INSERT INTO felitz_comptes(id,compagnie_id,type,solde) VALUES('${id(4)}','${id(2)}','entreprise',200000);
`);const sql=fs.readFileSync('supabase/development_maintenance_20261030.sql','utf8');await db.exec(sql);await db.exec(sql);return db;}
test('technical maintenance bills once with the event factor and retries return same running cycle',async()=>{const db=await setup();try{
 await db.exec(`UPDATE test_effects SET data='{"repair_percent":50,"repair_delay_percent":100}'`);
 const start=(await db.query('SELECT start_company_maintenance($1,$2) r',[id(1),id(3)])).rows[0].r;assert.equal(start.cout,75000);assert(start.temps_attente_min>=60&&start.temps_attente_min<=180);
 await db.query('SELECT start_company_maintenance($1,$2)',[id(1),id(3)]);
 assert.equal((await db.query('SELECT solde FROM felitz_comptes')).rows[0].solde,125000);assert.equal((await db.query('SELECT count(*)::int n FROM felitz_transactions')).rows[0].n,1);
 await assert.rejects(()=>db.query('SELECT start_company_maintenance($1,$2)',[id(99),id(3)]),/dirigeant/);
 assert.equal((await db.query('SELECT count(*)::int n FROM inspection_calls')).rows[0].n,0);
}finally{await db.close();}});
test('repair snapshot fixes cost, enforces delay and only completes inspection after a real technical cycle',async()=>{const db=await setup();try{
 await db.exec(`UPDATE test_effects SET data='{"repair_percent":50,"repair_delay_percent":100,"inspection_required":true}';
 INSERT INTO reparation_demandes(id,compagnie_id,avion_id,statut) VALUES('${id(6)}','${id(2)}','${id(3)}','demandee');
 UPDATE reparation_demandes SET statut='en_reparation';`);
 await assert.rejects(()=>db.exec("UPDATE reparation_demandes SET statut='terminee',prix_total=1000"),/délai technique/);
 assert.equal((await db.query('SELECT count(*)::int n FROM inspection_calls')).rows[0].n,0);
 await db.exec("UPDATE test_effects SET data='{}';UPDATE reparation_demandes SET maintenance_not_before=now()-interval '1 second';UPDATE reparation_demandes SET statut='terminee',prix_total=1000;");
 assert.equal((await db.query('SELECT prix_total FROM reparation_demandes')).rows[0].prix_total,1500);
 await db.exec("UPDATE reparation_demandes SET statut='facturee'");assert.equal((await db.query('SELECT prix_total FROM reparation_demandes')).rows[0].prix_total,1500);
 assert.equal((await db.query('SELECT count(*)::int n FROM inspection_calls')).rows[0].n,1);
}finally{await db.close();}});
test('insufficient funds or an active flight cannot start or debit maintenance',async()=>{const db=await setup();try{
 await db.exec("UPDATE felitz_comptes SET solde=1");await assert.rejects(()=>db.query('SELECT start_company_maintenance($1,$2)',[id(1),id(3)]),/Fonds insuffisants/);
 await db.exec(`UPDATE felitz_comptes SET solde=200000;INSERT INTO plans_vol VALUES('${id(3)}','accepte')`);await assert.rejects(()=>db.query('SELECT start_company_maintenance($1,$2)',[id(1),id(3)]),/déjà engagé/);
 assert.equal((await db.query('SELECT solde FROM felitz_comptes')).rows[0].solde,200000);assert.equal((await db.query('SELECT count(*)::int n FROM felitz_transactions')).rows[0].n,0);
 await db.exec('SET ROLE authenticated');await assert.rejects(()=>db.query('SELECT start_company_maintenance($1,$2)',[id(1),id(3)]),/permission denied/);
}finally{await db.close();}});
