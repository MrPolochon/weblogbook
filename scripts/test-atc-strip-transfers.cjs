const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/components/FlightStripBoardWrapper.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function render(strips,pending,activated=new Set()) {
 let state=0;const deps={react:{useState:()=>[state++===0?strips:activated,()=>{}],useRef:()=>({current:false}),useEffect:()=>{},useCallback:f=>f},'react/jsx-runtime':{jsx:(_type,props)=>props},'./FlightStripBoard':{default:()=>{}}};
 const m={exports:{}};new Function('require','exports','module',code)(n=>deps[n],m.exports,m);
 return m.exports.default({allStrips:strips,plansATraiter:pending}).strips;
}
test('an accepted transfer stays visible despite the old pending list',()=>{
 assert.equal(render([{id:'flight',statut:'accepte'}],['flight']).length,1);
});
test('unactivated pending plans remain in the acceptance queue',()=>{
 assert.equal(render([{id:'flight',statut:'depose'}],[]).length,0);
});
test('activating a pending transfer makes it visible',()=>{
 assert.equal(render([{id:'flight',statut:'en_attente'}],['flight'],new Set(['flight'])).length,1);
});
const apiCode=ts.transpileModule(fs.readFileSync('src/app/api/atc/strips/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function loadApi(fail=false){
 const row={id:'flight',statut:'automonitoring',automonitoring:false,current_holder_user_id:'controller'};
 const admin={from(){const q={select(){return this},eq(){return this},or(){return this},in(_field,statuses){this.statuses=statuses;return this},order(){return Promise.resolve(fail?{data:null,error:{message:'Unavailable'}}:{data:this.statuses.includes(row.statut)?[row]:[],error:null})}};return q}};
 const deps={'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'controller'}}})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/wake-turbulence':{getTypeWake:()=> 'M'}};
 const m={exports:{}};new Function('require','exports','module',apiCode)(n=>deps[n],m.exports,m);return m.exports.GET;
}
test('reclaimed flights with legacy automonitoring status are returned',async()=>{
 const res=await loadApi()();assert.equal(res.status,200);assert.equal(res.body.strips[0].id,'flight');
});
test('a failed fallback does not clear the console with a successful empty list',async()=>{
 const res=await loadApi(true)();assert.equal(res.status,503);assert.equal(res.body.strips,undefined);
});

