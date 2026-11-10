const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const id=n=>String(n).padStart(8,'0')+'-8888-4888-8888-888888888888';
function load(path,deps={}){
  const m={exports:{}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>{if(!(name in deps))throw Error(name);return deps[name];},m,m.exports);
  return m.exports;
}
const rules=load('src/lib/company-loans.ts');
function fixture(options={}){
  const calls=[];
  const api=load('src/app/api/compagnies/[id]/pret/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
    '@/lib/company-loans':rules,
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.anonymous?null:{id:id(1)}}})}})},
    '@/lib/rate-limit-shared':{rateLimitShared:async()=>({allowed:!options.limited})},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return options.error?{error:options.error}:{data:{ok:true}};}})},
  });
  return {api,calls};
}
const params={params:Promise.resolve({id:id(10)})};
const body=changes=>({request_id:id(100),montant:2500000,duree_jours:60,mode_remboursement:'quotidien',offre:'personnalise',...changes});
const request=value=>new Request('https://example.test/pret',{method:'POST',body:JSON.stringify(value)});
test('API binds actor/company and ignores submitted rates, capital and balances',async()=>{
  const f=fixture();
  assert.equal((await f.api.POST(request(body({actor_id:id(9),compagnie_id:id(9),taux_interet:0,capital:1e15,montant_total_du:0})),params)).status,200);
  assert.equal(f.calls[0].args.p_actor,id(1));assert.equal(f.calls[0].args.p_company,id(10));
  assert.deepEqual(f.calls[0].args.p_input,{montant:2500000,duree_jours:60,offre:'personnalise',mode_remboursement:'quotidien'});
});
test('invalid requests and unauthorized callers cannot reach a mutation',async()=>{
  const cases=[[{},body({montant:-100}),400],[{},body({montant:999999}),400],[{},body({montant:10000001}),400],[{},body({duree_jours:91}),400],[{},body({mode_remboursement:'vols'}),400],[{},body({request_id:'bad'}),400],[{anonymous:true},body(),401],[{limited:true},body(),429]];
  for(const [config,value,status]of cases){const f=fixture(config);assert.equal((await f.api.POST(request(value),params)).status,status);assert.equal(f.calls.length,0);}
});
test('repayment is bound to a specific loan, request and authenticated caller',async()=>{
  const f=fixture();
  assert.equal((await f.api.PATCH(request({montant:'1 000',pret_id:id(50),request_id:id(100)}),params)).status,200);
  assert.equal(f.calls[0].args.p_operation,'repay');assert.deepEqual(f.calls[0].args.p_input,{montant:1000,pret_id:id(50)});
  const invalid=fixture();assert.equal((await invalid.api.PATCH(request({montant:1000,request_id:id(100)}),params)).status,400);assert.equal(invalid.calls.length,0);
});
test('migration absence fails closed and authorization errors retain their status',async()=>{
  for(const [code,status]of [['PGRST202',503],['42501',403],['P0002',404],['P0001',409]]){
    const f=fixture({error:{code,message:'Unavailable'}});
    assert.equal((await f.api.POST(request(body()),params)).status,status);
    assert.equal(f.calls.length,1);
  }
});
test('loan reads use the authorized database dashboard',async()=>{
  const f=fixture();assert.equal((await f.api.GET(new Request('https://example.test'),params)).status,200);
  assert.equal(f.calls[0].name,'company_loan_dashboard');assert.equal(f.calls[0].args.p_actor,id(1));
});
