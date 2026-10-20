const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>deps[n]||require(n),module,module.exports);return module.exports;}
const {pilotNeedsFlightPlan,registrationLabel,planBookingUrl}=load('src/lib/events/registration.ts');
test('pilot registration is pending until an actual plan has been linked; ATC stays immediate',()=>{
 const slot={role:'pilot',status:'confirmed',plan_id:null,claimed_at:null};
 assert.equal(pilotNeedsFlightPlan(slot),true);assert.equal(registrationLabel(slot),'Plan de vol à compléter');
 assert.equal(registrationLabel({...slot,plan_id:'plan',claimed_at:'2026-10-20T18:00:00Z'}),'Inscription confirmée');
 assert.equal(registrationLabel({...slot,role:'atc'}),'Inscription confirmée');
 assert.equal(registrationLabel({...slot,status:'waitlisted'}),'Liste d’attente');
 assert.equal(registrationLabel({...slot,status:'cancelled'}),'Annulé');
 assert.match(registrationLabel({...slot,plan_id:'plan',plan_status:'annule'}),/annulé/);
 // Recording a completed flight deletes its plan but keeps the historical claim.
 assert.equal(registrationLabel({...slot,claimed_at:'2026-10-20T18:00:00Z'}),'Inscription confirmée');
 assert.equal(planBookingUrl('slot-id'),'/logbook/depot-plan-vol?reservation=slot-id');
});
function server(fixture){
 const query={filters:{},select(){return this},eq(k,v){this.filters[k]=v;return this},not(){return this},async maybeSingle(){return {data:fixture&&!Object.entries(this.filters).some(([k,v])=>fixture[k]!==v)?fixture:null,error:null}}};
 return load('src/lib/events/server.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({from(){query.filters={};return query}})}});
}
const booking={id:'slot',user_id:'owner',role:'pilot',status:'confirmed',departure:'ITKO',arrival:'IRFD',departure_at:'2026-10-20T18:00:00Z',duration_minutes:60,callsign:'AFR123',claimed_at:null,major_event_configs:{slot_minutes:10}};
test('reservation plan must match owner, route, callsign, duration and slot even outside an active event',async()=>{
 const {validateBookingFlight:validate}=server(booking);
 assert.equal(await validate('owner','slot','ITKO','IRFD','2026-10-20T18:00:00Z',60,'afr123'),null);
 for(const args of [
   ['stranger','slot','ITKO','IRFD','2026-10-20T18:00:00Z',60,'AFR123'],
   ['owner','slot','ITKO','IPPH','2026-10-20T18:00:00Z',60,'AFR123'],
   ['owner','slot','ITKO','IRFD','2026-10-20T19:00:00Z',60,'AFR123'],
   ['owner','slot','ITKO','IRFD','2026-10-20T18:10:00Z',60,'AFR123'],
   ['owner','slot','ITKO','IRFD','2026-10-20T18:00:00Z',90,'AFR123'],
   ['owner','slot','ITKO','IRFD','2026-10-20T18:00:00Z',60,'OTHER']
 ]) assert.equal(typeof await validate(...args),'string');
});
test('successful plan creation only confirms the booking really claimed by that owner and plan',async()=>{
 const {bookingLinkedToPlan:linked}=server({...booking,plan_id:'real-plan',claimed_at:'2026-10-20T18:00:00Z'});
 assert.equal(await linked('owner','slot','real-plan'),true);
 assert.equal(await linked('owner','slot','unrelated-plan'),false);
 assert.equal(await linked('stranger','slot','real-plan'),false);
 assert.equal(await linked('owner',undefined,'real-plan'),false);
});
test('booking API sends pilots to the plan and does not announce a completed registration',async()=>{
 const rules=load('src/lib/events/rules.ts',{'@/lib/aeroports-ptfs':{CODES_OACI_VALIDES:new Set(['ITKO','IRFD'])},'@/lib/atc-positions':{ATC_POSITIONS:['Tower']}});
 const notifications=[];
 const {POST}=load('src/app/api/evenements/reservations/route.ts',{
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:'new-slot',error:null})})},
  '@/lib/events/rules':rules,'@/lib/events/registration':{planBookingUrl},
  '@/lib/atc-grade-restrictions':{},'@/lib/notifications':{notifyUser:async(id,n)=>notifications.push(n)}
 });
 const request=status=>new Request('https://example.test/api/evenements/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:'12345678-1111-4111-8111-111111111111',role:'pilot',airport:'ITKO',starts_at:'2026-10-20T18:00:00Z',ends_at:'2026-10-20T18:10:00Z',movement:'departure',departure:'ITKO',arrival:'IRFD',departure_at:'2026-10-20T18:00:00Z',duration_minutes:60,callsign:'AFR123',aircraft:'A320',status})});
 const res=await POST(request('confirmed'));assert.equal(res.status,200);assert.equal((await res.json()).requires_plan,true);
 assert.match(notifications[0].title,/plan de vol à compléter/);assert.equal(notifications[0].link,planBookingUrl('new-slot'));
 const wait=await POST(request('waitlisted'));assert.equal((await wait.json()).requires_plan,false);assert.match(notifications[1].title,/liste d’attente/);
});
test('readiness API rejects pilot check-in until the real plan exists',async()=>{
 let called=false;
 let row={role:'pilot',status:'confirmed',plan_id:null,claimed_at:null,plans_vol:null};
 const query={select(){return this},eq(){return this},async maybeSingle(){return {data:row,error:null}}};
 const {PATCH}=load('src/app/api/evenements/reservations/[id]/route.ts',{
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})}})},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query,rpc:async()=>{called=true;return {error:null}}})},
  '@/lib/events/rules':{},'@/lib/events/registration':{pilotNeedsFlightPlan,planBookingUrl},'@/lib/atc-grade-restrictions':{},'@/lib/notifications':{}
 });
 const request=()=>new Request('https://example.test/api/evenements/reservations/slot',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ready'})});
 assert.equal((await PATCH(request(),{params:Promise.resolve({id:'slot'})})).status,409);assert.equal(called,false);
 row={...row,plan_id:'real-plan',claimed_at:'2026-10-20T18:00:00Z',plans_vol:{statut:'depose'}};
 assert.equal((await PATCH(request(),{params:Promise.resolve({id:'slot'})})).status,200);assert.equal(called,true);
});
