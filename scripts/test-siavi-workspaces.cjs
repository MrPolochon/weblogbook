const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(p,deps){const m={exports:{}};const c=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',c)(n=>deps[n]??{},m,m.exports);return m.exports;}
const json={NextResponse:{json:(body,opt)=>({body,status:opt?.status??200})}};
function grades({role='siavi',chief=true,targetRole='siavi',targetId='agent',targetGrade=null,newGrade='Agent SIAVI',siavi=true}={}){
 let writes=0;
 const admin={from(table){let value;return {select(){return this},eq(_k,v){value=v;return this},single:async()=>({data:table==='profiles'?{role:targetRole,siavi,siavi_grade_id:targetGrade? 'old':null}:value==='old'?{nom:targetGrade}:newGrade?{id:'new',nom:newGrade}:null}),update(){writes++;return this},then(resolve){resolve({error:null})}}}};
 const route=load('src/app/api/siavi/comptes/[id]/route.ts',{'@/lib/siavi/permissions':{isChefDeBrigade:async()=>chief},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'chief'}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role}})})})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'next/server':json});
 return {call:()=>route.PATCH({json:async()=>({siavi_grade_id:'new'})},{params:Promise.resolve({id:targetId})}),writes:()=>writes};
}
test('brigade chief can change agent grades',async()=>{const x=grades();assert.equal((await x.call()).status,200);assert.equal(x.writes(),1);});
for(const [name,opts] of [['ordinary agent',{chief:false}],['self promotion',{targetId:'chief'}],['chief appointment',{newGrade:'Chef de brigade SIAVI'}],['another chief',{targetGrade:'Chef de brigade SIAVI'}],['administrator target',{targetRole:'admin'}]])test(`brigade denies ${name}`,async()=>{const x=grades(opts);assert.equal((await x.call()).status,403);assert.equal(x.writes(),0);});
test('pending report check accepts a report already attached to another mission segment',async()=>{
 const admin={from(table){let mission=false;const q={select(){return this},eq(){return this},not(){return this},is(){return this},order(){return this},in(column){mission=column==='medevac_mission_id';return this},then(resolve){resolve({data:table==='siavi_rapports_medevac'?[{plan_vol_id:'first'}]:mission?[{id:'first',medevac_mission_id:'mission'},{id:'last',medevac_mission_id:'mission'}]:[{id:'last',medevac_mission_id:'mission'}],error:null})}};return q}};
 const f=load('src/lib/siavi/pending-report.ts',{});assert.equal(await f.getPendingMedevacReport(admin,'pilot'),null);
});
test('SIAVI workspace destinations remain inside SIAVI',()=>{const {SIAVI_WORKSPACES}=load('src/lib/siavi/workspaces.ts',{});assert.deepEqual(Object.values(SIAVI_WORKSPACES).map(x=>x.href),['/siavi/pompier','/siavi/afis','/siavi/medevac']);});
