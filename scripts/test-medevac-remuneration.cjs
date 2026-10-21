const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
async function setup(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TABLE profiles(id uuid PRIMARY KEY,identifiant text,role text,siavi boolean);
INSERT INTO profiles VALUES('${id(1)}','pilote','siavi',true),('${id(2)}','soignant','pilote',true),('${id(3)}','externe','pilote',false);
CREATE TABLE types_avion(id uuid PRIMARY KEY,nom text,categorie text);
INSERT INTO types_avion VALUES('${id(10)}','Avion médical','commercial'),('${id(11)}','H135','helicoptere');
CREATE TABLE siavi_avions(id uuid PRIMARY KEY,type_avion_id uuid,immatriculation text);
INSERT INTO siavi_avions VALUES('${id(12)}','${id(10)}','F-MED'),('${id(13)}','${id(11)}','F-HEL');
CREATE TABLE plans_vol(id uuid PRIMARY KEY,pilote_id uuid,siavi_avion_id uuid,statut text,medevac_next_plan_id uuid,medevac_mission_id uuid,numero_vol text,aeroport_depart text,demande_cloture_at timestamptz,cloture_at timestamptz,heure_depart_reelle timestamptz,accepted_at timestamptz);
CREATE TABLE felitz_comptes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,proprietaire_id uuid,vban text UNIQUE,solde bigint DEFAULT 0,created_at timestamptz DEFAULT now());
INSERT INTO felitz_comptes(type,solde) VALUES('siavi',0);
CREATE TABLE felitz_transactions(id uuid DEFAULT gen_random_uuid(),compte_id uuid,type text,montant bigint,libelle text);
CREATE TABLE siavi_rapports_medevac(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),numero_mission serial,plan_vol_id uuid UNIQUE,date_mission date,operator_base text,aircraft_registration text,aircraft_type text,aircraft_role text,commander text,co_pilot text,medical_team text,mission_timeline jsonb,medical_summary text,ground_event text,outcome text,safety_remarks text,created_by uuid);
`);await db.exec(fs.readFileSync('supabase/medevac_crew_remuneration_v2.sql','utf8'));return db;}
async function add(db,n,{helicopter=false,version=2,mission=null,next=null,minutes=100}={}){await db.query(`INSERT INTO plans_vol(id,pilote_id,siavi_avion_id,statut,numero_vol,aeroport_depart,accepted_at,cloture_at,medevac_remuneration_version,medevac_mission_id,medevac_next_plan_id) VALUES($1,$2,$3,'cloture','MEDEVAC01','IRFD','2026-10-21 10:00Z','2026-10-21 10:00Z'::timestamptz+($4||' minutes')::interval,$5,$6,$7)`,[id(n),id(1),id(helicopter?13:12),String(minutes),version,mission,next]);}
const report={commander:'pilote',medical_summary:'Transport simulé',outcome:'Mission terminée',mission_timeline:[]};
async function submit(db,n,crew=[id(1),id(2)],author=id(1)){return (await db.query('SELECT submit_medevac_report($1,$2,$3::jsonb,$4::uuid[]) AS result',[id(n),author,JSON.stringify(report),crew])).rows[0].result;}
test('MEDEVAC transaction: fair pay, duplicate protection, eligibility and rollback',async()=>{const db=await setup();try{
 await add(db,20);const result=await submit(db,20,[id(2),id(2)]);assert.equal(result.remuneration.revenu_total,650000);assert.equal(result.remuneration.part_siavi,325000);assert.equal(result.participants.length,2);assert.equal(result.participants.reduce((n,p)=>n+p.montant,0),325000);
 const balance=()=>db.query('SELECT sum(solde)::text total FROM felitz_comptes');const before=(await balance()).rows[0].total;await submit(db,20);assert.equal((await balance()).rows[0].total,before);assert.equal((await db.query('SELECT count(*)::int n FROM siavi_rapports_medevac')).rows[0].n,1);
 await add(db,21,{helicopter:true});const heli=await submit(db,21);assert.equal(heli.remuneration.revenu_total,360000);assert(heli.remuneration.revenu_total<result.remuneration.revenu_total);
 await add(db,22);await assert.rejects(()=>submit(db,22,[id(3)]),/agents SIAVI/);assert.equal((await db.query('SELECT count(*)::int n FROM siavi_rapports_medevac WHERE plan_vol_id=$1',[id(22)])).rows[0].n,0);
 await assert.rejects(()=>submit(db,22,[id(1)],id(2)),/Seul le pilote/);
 await add(db,23,{version:1});const old=await submit(db,23);assert.equal(old.remuneration.legacy,true);assert(old.participants.every(p=>p.montant===0));
 await add(db,24,{mission:id(30),minutes:45,next:id(25)});await add(db,25,{mission:id(30),minutes:15});const multi=await submit(db,25);assert.equal(multi.remuneration.revenu_total,450000);await assert.rejects(()=>submit(db,24),/finale clôturée/);
 const capped=(await db.query('SELECT medevac_mission_revenue(99999,false)::int AS plane,medevac_mission_revenue(99999,true)::int AS heli')).rows[0];assert.equal(capped.plane,2000000);assert.equal(capped.heli,800000);
 await add(db,26);await db.exec(`CREATE FUNCTION fail_transaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'payment offline'; END $$; CREATE TRIGGER fail_payment BEFORE INSERT ON felitz_transactions FOR EACH ROW EXECUTE FUNCTION fail_transaction();`);const beforeFailure=(await balance()).rows[0].total;await assert.rejects(()=>submit(db,26),/payment offline/);assert.equal((await balance()).rows[0].total,beforeFailure);assert.equal((await db.query('SELECT count(*)::int n FROM siavi_rapports_medevac WHERE plan_vol_id=$1',[id(26)])).rows[0].n,0);
}finally{await db.close();}});
