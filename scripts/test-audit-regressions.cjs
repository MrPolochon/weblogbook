const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(file,dependencies={}) {const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>dependencies[name]??require(name),m,m.exports);return m.exports;}
test('ATIS panel, ticker and warning share one outstanding request and recover after failure',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);
 const api=load('src/lib/atis-overview-client.ts',{'@/lib/fetch-json':{fetchJson:async()=>{calls++;await gate;return {instances:[]};}}});
 const three=[api.getSharedAtisOverview(),api.getSharedAtisOverview(),api.getSharedAtisOverview()];assert.equal(calls,1);release();await Promise.all(three);await api.getSharedAtisOverview();assert.equal(calls,2);
 let fail=true;const recovery=load('src/lib/atis-overview-client.ts',{'@/lib/fetch-json':{fetchJson:async()=>{if(fail)throw Error('offline');return {instances:[]};}}});
 await assert.rejects(recovery.getSharedAtisOverview());fail=false;assert.deepEqual(await recovery.getSharedAtisOverview(),{instances:[]});
});
test('ATIS polling skips hidden tabs and releases the visibility listener',()=>{
 const old=global.document;const events=new Map();global.document={visibilityState:'hidden',addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key)};
 try{const api=load('src/lib/atis-overview-client.ts',{'@/lib/fetch-json':{fetchJson:async()=>({instances:[]})}});let calls=0;const stop=api.subscribeAtisPolling(()=>calls++);assert.equal(calls,0);global.document.visibilityState='visible';events.get('visibilitychange')();assert.equal(calls,1);stop();assert.equal(events.size,0);}finally{global.document=old;}
});
test('Ground Crew cannot revive a paid or refused request or skip acceptance',()=>{
 const {canTransitionGroundService}=load('src/lib/ground/service-workflow.ts');
 for(const terminal of ['completed','rejected','ground_crew_unavailable'])for(const next of ['pending','accepted','in_progress','completed'])assert.equal(canTransitionGroundService(terminal,next),false);
 assert.equal(canTransitionGroundService('pending','completed'),false);assert.equal(canTransitionGroundService('pending','accepted'),true);assert.equal(canTransitionGroundService('in_progress','completed'),true);
});
test('shared rate limits hash identities and fail closed on database errors',async()=>{
 let args;const api=load('src/lib/rate-limit-shared.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(_name,p)=>{args=p;return {data:{allowed:true,remaining:2,reset_at:1234},error:null};}})}});
 assert.deepEqual(await api.rateLimitShared('private-ip:127.0.0.1',3,60000),{allowed:true,remaining:2,resetAt:1234});assert.match(args.p_key,/^[a-f0-9]{64}$/);assert.ok(!args.p_key.includes('127.0.0.1'));
 const denied=load('src/lib/rate-limit-shared.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({error:{message:'offline'}})})}});assert.equal((await denied.rateLimitShared('key',3,60000)).allowed,false);
});
test('signed email webhook rejects tampering and expired payloads',()=>{
 const {Webhook}=require('svix');const secret='whsec_'+Buffer.alloc(32,7).toString('base64');const webhook=new Webhook(secret);const id='msg-test';const date=new Date();const body='{"type":"email.delivered"}';const signature=webhook.sign(id,date,body);
 const headers={'svix-id':id,'svix-timestamp':String(Math.floor(date.getTime()/1000)),'svix-signature':signature};assert.doesNotThrow(()=>webhook.verify(body,headers));assert.throws(()=>webhook.verify(body+' ',headers));assert.throws(()=>webhook.verify(body,{...headers,'svix-timestamp':'1'}));
});
