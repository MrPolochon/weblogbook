const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, deps = {}, extra = '') {
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code + extra)(name => deps[name] ?? (name.startsWith('@/') ? {} : require(name)),mod,mod.exports);
  return mod.exports;
}
const form = load('src/lib/pilot-flight-form.ts');
test('company ICAO and personal registration prefill remain suggestions, including after an intentional clear', () => {
  const afr = form.suggestedPilotCallsign(true,' afr ','F-TEST');
  assert.equal(afr,'AFR');
  assert.equal(form.applyCallsignSuggestion('BAW',afr,false),'AFR');
  assert.equal(form.applyCallsignSuggestion('RAIDER21',afr,true),'RAIDER21');
  assert.equal(form.applyCallsignSuggestion('',afr,true),'');
  assert.equal(form.suggestedPilotCallsign(false,'BAW',' f-hilo '),'F-HILO');
});
test('display accepts the server amounts unchanged and rejects expired or incomplete flight quotes', () => {
  const q={quote_id:'fixed-draw',expires_at:'2026-10-30T00:00:00Z',nb_pax_genere:125,cargo_kg_genere:3500,revenue_brut:123456,salaire_pilote:0,prix_billet_utilise:0,prix_kg_cargo_utilise:3,type_cargaison:'marchandise_rare',type_cargaison_libelle:'Tableaux'};
  assert.deepEqual(form.readDisplayFlightQuote(q,Date.parse('2026-10-29T12:00Z')),q);
  assert.throws(()=>form.readDisplayFlightQuote(q,Date.parse(q.expires_at)),/expiré/);
  for(const value of [NaN,-1,'100',undefined])assert.throws(()=>form.readDisplayFlightQuote({...q,revenue_brut:value},0),/incomplet/);
  assert.throws(()=>form.readDisplayFlightQuote({...q,expires_at:'demain'},0));
});
test('financial inputs preserve explicit zero and reject empty, negative, infinite and unintended rounding',()=>{
  const {financialInput}=load('src/lib/financial-input.ts');
  assert.equal(financialInput('0','Taxe',100),0);
  assert.equal(financialInput('2,75','Taxe',100),2.75);
  for(const value of ['', ' ', '-1','101','NaN','Infinity'])assert.throws(()=>financialInput(value,'Taxe',100));
  assert.throws(()=>financialInput('1.5','Prix actuel',100,true));
  assert.equal(financialInput('100','Prix actuel',100,true),100);
});
function taxApi(role='admin') {
  const writes=[];
  const client={auth:{getUser:async()=>({data:{user:{id:'staff'}}})},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role}})})};
  const admin={from:()=>({upsert(value){writes.push(value);return this;},select(){return this;},single:async()=>({data:writes.at(-1)})})};
  const route=load('src/app/api/taxes/route.ts',{'@/lib/supabase/server':{createClient:async()=>client},'@/lib/supabase/admin':{createAdminClient:()=>admin},'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}}});
  return {writes,post:body=>route.POST({json:async()=>body})};
}
test('staff tax API keeps a configured zero; invalid rates cannot reach the database',async()=>{
  const f=taxApi();const r=await f.post({code_oaci:' irfd ',taxe_pourcent:0,taxe_vfr_pourcent:0});
  assert.equal(r.status,200);assert.deepEqual(f.writes,[{code_oaci:'IRFD',taxe_pourcent:0,taxe_vfr_pourcent:0}]);
  for(const rate of [-1,101,'2',Infinity])assert.equal((await f.post({code_oaci:'IRFD',taxe_pourcent:rate})).status,400);
  assert.equal(f.writes.length,1);
  const denied=taxApi('pilote');assert.equal((await denied.post({code_oaci:'IRFD',taxe_pourcent:0})).status,403);assert.equal(denied.writes.length,0);
});
test('actual flight tax distribution respects zero and only uses defaults for absent configuration',async()=>{
  const {distribuerTaxesATC}=load('src/lib/plans-vol/closure.ts',{},'\nexports.distribuerTaxesATC=distribuerTaxesATC;');
  for(const [row,rule,expected] of [[{taxe_pourcent:0,taxe_vfr_pourcent:0},'IFR',0],[{taxe_pourcent:0,taxe_vfr_pourcent:0},'VFR',0],[null,'IFR',200],[null,'VFR',500],[{taxe_pourcent:2.75},'IFR',275]]){
    const admin={from:table=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:row}),then:resolve=>resolve({data:[]})};return q;}};
    assert.deepEqual(await distribuerTaxesATC(admin,'plan',10000,'IRFD',rule,'AFR12'),{taxesTotales:expected,atcPayes:0});
  }
});
test('server timeout gives a readable retry message and always clears its timer',async()=>{
  let timer,cleared=false;
  const code=ts.transpileModule(fs.readFileSync('src/lib/fetch-json.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const mod={exports:{}};
  const fetch=(_url,init)=>new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(Error('signal is aborted without reason')));});
  new Function('fetch','exports','setTimeout','clearTimeout',code)(fetch,mod.exports,fn=>{timer=fn;return 42;},id=>{assert.equal(id,42);cleared=true;});
  const promise=mod.exports.fetchJson('/api/test');timer();
  await assert.rejects(promise,/serveur met trop de temps/);assert.equal(cleared,true);
});
