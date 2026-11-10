const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>String(n).padStart(8,'0')+'-7777-4777-8777-777777777777';
function load(path,deps={}) {
  const m={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{
    if(!(name in deps))throw Error('Unexpected dependency '+name);
    return deps[name];
  },m,m.exports);
  return m.exports;
}
const terms=load('src/lib/company-loans.ts');

async function setup(){
  const db=new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(
    "CREATE TABLE profiles(id uuid PRIMARY KEY,role text);"+
    "CREATE TABLE compagnies(id uuid PRIMARY KEY,pdg_id uuid,nom text);"+
    "CREATE TABLE compagnie_employes(compagnie_id uuid,pilote_id uuid,role text);"+
    "CREATE TABLE types_avion(id uuid PRIMARY KEY,prix bigint);"+
    "CREATE TABLE compagnie_avions(id uuid PRIMARY KEY,compagnie_id uuid,type_avion_id uuid,detruit boolean);"+
    "CREATE TABLE felitz_comptes(id uuid PRIMARY KEY,compagnie_id uuid,type text,solde bigint);"+
    "CREATE TABLE felitz_transactions(id uuid DEFAULT gen_random_uuid(),compte_id uuid,type text,montant bigint,libelle text);"+
    "CREATE TABLE prets_bancaires(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),compagnie_id uuid,demandeur_id uuid,montant_emprunte bigint,taux_interet numeric(5,2),montant_total_du bigint,montant_rembourse bigint DEFAULT 0,statut text DEFAULT 'actif',created_at timestamptz DEFAULT now(),rembourse_at timestamptz,echeance_at timestamptz,decouvert_depuis timestamptz);"+
    "GRANT ALL ON prets_bancaires TO authenticated;"
  );
  await db.query("INSERT INTO profiles VALUES($1,'pilote'),($2,'admin'),($3,'pilote'),($4,'pilote')",[id(1),id(2),id(3),id(4)]);
  await db.query("INSERT INTO compagnies VALUES($1,$2,'Test'),($3,$4,'Autre')",[id(10),id(1),id(11),id(3)]);
  await db.query("INSERT INTO compagnie_employes VALUES($1,$2,'co_pdg')",[id(10),id(4)]);
  await db.query("INSERT INTO felitz_comptes VALUES($1,$2,'entreprise',4000000)",[id(20),id(10)]);
  await db.query("INSERT INTO types_avion VALUES($1,2000000)",[id(30)]);
  await db.query("INSERT INTO compagnie_avions VALUES($1,$2,$3,false),($4,$2,$3,true),($5,$6,$3,false)",[id(31),id(10),id(30),id(32),id(33),id(11)]);
  // Same selector as the deployed settlement, without unrelated flight fixtures.
  await db.exec("CREATE FUNCTION settle_flight_economy(p_plan uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE c record; loan prets_bancaires%ROWTYPE; BEGIN SELECT p_plan id INTO c; SELECT * INTO loan FROM prets_bancaires WHERE compagnie_id=c.id AND statut='actif' ORDER BY id LIMIT 1 FOR UPDATE; RETURN to_jsonb(loan); END $$;");
  await db.exec(fs.readFileSync('supabase/company_loans_20261110.sql','utf8'));
  return db;
}
const input=(overrides={})=>({montant:1000000,duree_jours:30,offre:'personnalise',mode_remboursement:'quotidien',...overrides});
async function action(db,op='borrow',value=input(),request=100,actor=1){
  return (await db.query('SELECT manage_company_loan($1,$2,$3,$4,$5::jsonb) result',[id(actor),id(10),op,id(request),JSON.stringify(value)])).rows[0].result;
}
const balance=async db=>Number((await db.query('SELECT solde FROM felitz_comptes WHERE id=$1',[id(20)])).rows[0].solde);
const count=async(db,table)=>Number((await db.query('SELECT count(*) n FROM '+table)).rows[0].n);
const collect=async(db,loan)=>(await db.query('SELECT collect_company_loan($1) result',[loan])).rows[0].result;
async function age(db,loan,days){
  await db.query("UPDATE prets_bancaires SET created_at=now()-($2::integer*interval '24 hours')-interval '1 minute',echeance_at=now()+((duree_jours-$2::integer)*interval '24 hours')-interval '1 minute' WHERE id=$1",[loan,days]);
}

test('custom limits, duration and strict money parsing',()=>{
  for(const n of [0,-1,999999,10000001,1000000.5,Infinity,NaN])assert.equal(terms.calculerOffrePret(n,30),null);
  for(const d of [0,91,1.5,NaN])assert.equal(terms.calculerOffrePret(1000000,d),null);
  assert.equal(terms.calculerOffrePret(200000,90,'standard').total,203000);
  assert.equal(terms.calculerOffrePret(300000,90,'standard'),null);
  assert.equal(terms.calculerOffrePret(1000000,90).total,1100000);
  assert.equal(terms.calculerOffrePret(2500000,60).total,2729250);
  assert.equal(terms.calculerOffrePret(10000000,90).total,13000000);
  for(const v of ['-100','1e6','1.5','1000foo',{},null,1.5])assert.equal(terms.parseMontantPret(v),null);
  assert.equal(terms.parseMontantPret('1 000 000'),1000000);
  assert.equal(terms.parseMontantPret('1000000'),1000000);
});

test('client and database quotes agree across amount and term boundaries',async()=>{
  const db=await setup();try{
    for(const amount of [1000000,1000001,1250000,2499999,2500000,4999999,5000000,5000001,7777777,9999999,10000000]){
      for(const days of [1,7,30,45,60,89,90]){
        const expected=terms.calculerOffrePret(amount,days);
        const actual=(await db.query("SELECT company_loan_terms($1,$2,'personnalise') v",[amount,days])).rows[0].v;
        for(const key of ['montant','dureeJours','tauxInteret','interets','total'])assert.equal(actual[key],expected[key],amount+'/'+days+'/'+key);
      }
    }
  }finally{await db.close();}
});

test('capital uses cash and owned non-destroyed aircraft minus debts',async()=>{
  const db=await setup();try{
    const cap=(await db.query('SELECT company_loan_capital($1) v',[id(10)])).rows[0].v;
    assert.equal(cap.capital,6000000);assert.equal(cap.avions,2000000);
    await assert.rejects(action(db,'borrow',input({montant:6000001})),/capital/);
    assert.equal(await count(db,'prets_bancaires'),0);
    await action(db,'borrow',input({montant:6000000}));
    const after=(await db.query('SELECT company_loan_capital($1) v',[id(10)])).rows[0].v;
    assert.equal(after.dettes,6439800); // 22% at 90 days, prorated to 7.33% at 30 days
    assert.equal(after.capital,5560200);
  }finally{await db.close();}
});

test('origination is idempotent, checks permission and permits only one active loan',async()=>{
  const db=await setup();try{
    await assert.rejects(action(db,'borrow',input(),100,3),/direction/);
    const loan=await action(db,'borrow',input(),100,4);
    assert.equal((await action(db,'borrow',input(),100,4)).pret.id,loan.pret.id);
    assert.equal(await balance(db),5000000);assert.equal(await count(db,'felitz_transactions'),1);
    await assert.rejects(action(db,'borrow',input({montant:2000000}),100,4),/déjà utilisé/);
    await assert.rejects(action(db,'borrow',input(),101),/déjà en cours/);
    assert.equal(await count(db,'prets_bancaires'),1);
  }finally{await db.close();}
});

test('database validates custom bounds, days and mode independently of the API',async()=>{
  const db=await setup();try{
    for(const invalid of [{montant:999999},{montant:10000001},{duree_jours:91},{duree_jours:1.5},{duree_jours:null},{mode_remboursement:'vols'},{offre:'invalid'}])
      await assert.rejects(action(db,'borrow',input(invalid)));
    assert.equal(await balance(db),4000000);assert.equal(await count(db,'prets_bancaires'),0);
  }finally{await db.close();}
});

test('credit or ledger failure rolls back loan and balance together',async()=>{
  const db=await setup();try{
    await db.exec('ALTER TABLE felitz_transactions ADD CHECK(montant<1)');
    await assert.rejects(action(db),/check constraint/);
    assert.equal(await balance(db),4000000);
    assert.equal(await count(db,'prets_bancaires'),0);
    assert.equal(await count(db,'company_loan_operations'),0);
  }finally{await db.close();}
});

test('manual repayment is atomic, bounded and retry-safe',async()=>{
  const db=await setup();try{
    const {pret}=await action(db);
    const payment={montant:500000,pret_id:pret.id};
    assert.equal((await action(db,'repay',payment,101)).montantRembourse,500000);
    assert.equal((await action(db,'repay',payment,101)).montantRembourse,500000);
    assert.equal(await balance(db),4500000);
    const finish=await action(db,'repay',{montant:9999999,pret_id:pret.id},102);
    assert.equal(finish.montantRembourse,533300);assert.equal(finish.pret.statut,'rembourse');
    const after=await balance(db);
    await action(db,'borrow',input(),103);
    await action(db,'repay',payment,101);
    assert.equal(await balance(db),after+1000000);
  }finally{await db.close();}
});

test('insufficient balance and ledger failure never erase unpaid debt',async()=>{
  const db=await setup();try{
    const {pret}=await action(db);
    await db.exec('UPDATE felitz_comptes SET solde=0');
    await assert.rejects(action(db,'repay',{montant:5000,pret_id:pret.id},101),/Solde insuffisant/);
    await db.exec("UPDATE felitz_comptes SET solde=100000; ALTER TABLE felitz_transactions ADD CHECK(type='credit') NOT VALID");
    await assert.rejects(action(db,'repay',{montant:5000,pret_id:pret.id},101),/check constraint/);
    assert.equal(await balance(db),100000);
    assert.equal(Number((await db.query('SELECT montant_rembourse FROM prets_bancaires WHERE id=$1',[pret.id])).rows[0].montant_rembourse),0);
  }finally{await db.close();}
});

test('daily collection catches up missed days without double billing and clears the exact total',async()=>{
  const db=await setup();try{
    const {pret}=await action(db);
    assert.equal((await collect(db,pret.id)).paid,0);
    await age(db,pret.id,1);assert.equal((await collect(db,pret.id)).paid,34443);
    assert.equal((await collect(db,pret.id)).paid,0);
    await age(db,pret.id,5);assert.equal((await collect(db,pret.id)).paid,137774);
    await age(db,pret.id,30);assert.equal((await collect(db,pret.id)).paid,861083);
    assert.equal(await balance(db),3966700);
    assert.equal((await collect(db,pret.id)).paid,0);
  }finally{await db.close();}
});

test('early repayment covers upcoming daily targets and shortfalls catch up',async()=>{
  const db=await setup();try{
    const {pret}=await action(db);
    await action(db,'repay',{montant:200000,pret_id:pret.id},101);
    await age(db,pret.id,5);assert.equal((await collect(db,pret.id)).paid,0);
    await age(db,pret.id,6);assert.equal((await collect(db,pret.id)).paid,6660);
    await age(db,pret.id,7);await db.exec('UPDATE felitz_comptes SET solde=1000');
    assert.equal((await collect(db,pret.id)).paid,1000);
    assert.equal((await collect(db,pret.id)).paid,0);
    await db.exec('UPDATE felitz_comptes SET solde=100000');
    assert.equal((await collect(db,pret.id)).paid,33443);
  }finally{await db.close();}
});

test('end-of-term mode charges only at maturity, retaining the overdraft recovery policy',async()=>{
  const db=await setup();try{
    const {pret}=await action(db,'borrow',input({mode_remboursement:'echeance'}));
    await age(db,pret.id,29);assert.equal((await collect(db,pret.id)).paid,0);
    await db.exec('UPDATE felitz_comptes SET solde=1000');
    await age(db,pret.id,30);
    assert.equal((await collect(db,pret.id)).paid,1033300);
    assert.equal(await balance(db),-1032300);
    const row=(await db.query('SELECT statut,decouvert_depuis FROM prets_bancaires WHERE id=$1',[pret.id])).rows[0];
    assert.equal(row.statut,'rembourse');assert.ok(row.decouvert_depuis);
    assert.equal((await collect(db,pret.id)).paid,0);
    await assert.rejects(action(db,'borrow',input(),102),/remis à niveau/);
  }finally{await db.close();}
});

test('scheduled loans are excluded from flight payments; existing loans retain their mode',async()=>{
  const db=await setup();try{
    const {pret}=await action(db);
    assert.equal((await db.query('SELECT settle_flight_economy($1) v',[id(10)])).rows[0].v?.id ?? null,null);
    await db.query("UPDATE prets_bancaires SET mode_remboursement='vols' WHERE id=$1",[pret.id]);
    assert.equal((await db.query('SELECT settle_flight_economy($1) v',[id(10)])).rows[0].v.id,pret.id);
    // Migration reapplication preserves the loan and is safe.
    await db.exec(fs.readFileSync('supabase/company_loans_20261110.sql','utf8'));
    assert.equal((await db.query('SELECT settle_flight_economy($1) v',[id(10)])).rows[0].v.id,pret.id);
    assert.equal(await balance(db),5000000);
  }finally{await db.close();}
});

test('ordinary clients cannot change balances, loan terms or run collection functions',async()=>{
  const db=await setup();try{
    await db.exec('SET ROLE authenticated');
    await assert.rejects(action(db),/permission denied/);
    await assert.rejects(db.query('SELECT collect_due_company_loans()'),/permission denied/);
    await assert.rejects(db.query("UPDATE prets_bancaires SET montant_rembourse=montant_total_du"),/permission denied/);
  }finally{await db.close();}
});

test('displayed schedule absorbs early payments and rounds to the exact final total',()=>{
  const base={created_at:'2026-01-01T10:00:00Z',echeance_at:'2026-01-04T10:00:00Z',duree_jours:3,mode_remboursement:'quotidien',montant_total_du:100,montant_rembourse:40};
  const day1=terms.echeancierPret(base,Date.parse('2026-01-02T11:00:00Z'));
  assert.equal(day1.exigible,0);assert.equal(day1.prochaine.montant,27);
  const last=terms.echeancierPret({...base,montant_rembourse:67},Date.parse('2026-01-04T10:00:00Z'));
  assert.equal(last.exigible,33);assert.equal(last.reste,33);
});
