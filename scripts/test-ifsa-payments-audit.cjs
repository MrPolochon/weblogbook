const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
test('IFSA atomic payment, duplicate, permissions, lifted, rollback and durable salary snapshot',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE profiles(id uuid PRIMARY KEY,identifiant text);
 CREATE TABLE compagnies(id uuid PRIMARY KEY,pdg_id uuid,nom text,pourcentage_salaire int);
 CREATE TABLE felitz_comptes(id uuid PRIMARY KEY,proprietaire_id uuid,compagnie_id uuid,type text,solde bigint);
 CREATE TABLE felitz_transactions(id uuid DEFAULT gen_random_uuid(),compte_id uuid,type text,montant bigint,libelle text,reference_id uuid);
 CREATE TABLE ifsa_sanctions(id uuid PRIMARY KEY,type_sanction text,cible_pilote_id uuid,cible_compagnie_id uuid,amende_payee boolean DEFAULT false,actif boolean DEFAULT true,montant_amende int,compte_destination_id uuid,motif text,emis_par_id uuid,amende_payee_at timestamptz,amende_payee_par_id uuid,cleared_at timestamptz);
 CREATE TABLE ifsa_paiements_amendes(sanction_id uuid,montant int,paye_par_id uuid,compte_debit_id uuid,compte_credit_id uuid);
 CREATE TABLE messages(id uuid DEFAULT gen_random_uuid(),expediteur_id uuid,destinataire_id uuid,titre text,contenu text,type_message text,metadata jsonb,cheque_montant int,cheque_libelle text);
 CREATE TABLE plans_vol(id uuid PRIMARY KEY,numero_vol text,pilote_id uuid,copilote_id uuid,aeroport_depart text,aeroport_arrivee text,compagnie_id uuid,accepted_at timestamptz,demande_cloture_at timestamptz,temps_prev_min int,revenue_brut int,salaire_pilote int);
 CREATE TABLE reparation_demandes(id uuid,statut text);
 INSERT INTO profiles VALUES('${id(1)}','pilote'),('${id(2)}','mrpolochon');
 INSERT INTO felitz_comptes VALUES('${id(11)}','${id(1)}',null,'personnel',1000),('${id(12)}',null,null,'entreprise',0),('${id(13)}','${id(2)}',null,'personnel',1000);
 INSERT INTO ifsa_sanctions(id,type_sanction,cible_pilote_id,montant_amende,compte_destination_id,motif) VALUES('${id(21)}','amende','${id(1)}',200,'${id(12)}','test');`);
 await db.exec(fs.readFileSync('supabase/ifsa_payments_and_audit.sql','utf8'));
 const pay=(fine=21,actor=1,account=null)=>db.query('SELECT payer_amende_ifsa_atomique($1,$2,$3) result',[id(fine),id(actor),account&&id(account)]);
 await assert.rejects(()=>pay(21,2),/Non autorisé/);await assert.rejects(()=>pay(21,1,13),/non autorisé/);
 await pay();await pay();assert.equal(Number((await db.query('SELECT solde FROM felitz_comptes WHERE id=$1',[id(11)])).rows[0].solde),800);
 assert.equal((await db.query('SELECT count(*)::int n FROM ifsa_paiements_amendes')).rows[0].n,1);
 assert.equal((await db.query('SELECT cleared_at FROM ifsa_sanctions')).rows[0].cleared_at,null);
 await db.exec(`INSERT INTO ifsa_sanctions(id,type_sanction,cible_pilote_id,montant_amende,compte_destination_id,motif,actif) VALUES('${id(22)}','amende','${id(1)}',200,'${id(12)}','levée',false),('${id(23)}','amende','${id(1)}',200,'${id(12)}','erreur',true),('${id(24)}','amende','${id(1)}',2000,'${id(12)}','solde',true);`);
 await assert.rejects(()=>pay(22),/levée/);await assert.rejects(()=>pay(24),/Solde insuffisant/);
 await db.exec(`CREATE FUNCTION fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ledger unavailable'; END $$;CREATE TRIGGER fail_ledger BEFORE INSERT ON felitz_transactions FOR EACH ROW EXECUTE FUNCTION fail_ledger();`);
 await assert.rejects(()=>pay(23),/ledger unavailable/);
 assert.equal(Number((await db.query('SELECT solde FROM felitz_comptes WHERE id=$1',[id(11)])).rows[0].solde),800);
 assert.equal((await db.query('SELECT amende_payee FROM ifsa_sanctions WHERE id=$1',[id(23)])).rows[0].amende_payee,false);
 await db.exec(`DROP TRIGGER fail_ledger ON felitz_transactions;INSERT INTO plans_vol(id,numero_vol,pilote_id,aeroport_depart,aeroport_arrivee) VALUES('${id(31)}','RYR5552','${id(1)}','IRFD','IPPH');INSERT INTO messages(type_message,metadata,cheque_montant,cheque_libelle) VALUES('cheque_salaire','{"plan_vol_id":"${id(31)}"}',200,'Salaire pilote');`);
 const msg=(await db.query("SELECT * FROM messages WHERE type_message='cheque_salaire'")).rows[0];assert.equal(msg.metadata.flight_origin.aeroport_depart,'IRFD');
 await db.query("INSERT INTO felitz_transactions(compte_id,type,montant,libelle,source_message_id,flight_origin) VALUES($1,'credit',200,'salaire',$2,$3)",[id(11),msg.id,msg.metadata.flight_origin]);
 await db.exec('DELETE FROM plans_vol;DELETE FROM messages');assert.equal((await db.query('SELECT flight_origin FROM felitz_transactions WHERE source_message_id IS NOT NULL')).rows[0].flight_origin.numero_vol,'RYR5552');
 }finally{await db.close()}
});
