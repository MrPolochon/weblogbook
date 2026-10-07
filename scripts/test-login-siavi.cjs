const {test}=require('node:test'); const assert=require('node:assert/strict'); const fs=require('fs'); const ts=require('typescript');
function load(path,deps={}) { const m={exports:{}}; const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; new Function('require','module','exports',code)(n=>deps[n]||{},m,m.exports); return m.exports; }
const rules=load('src/lib/siavi/service-rules.ts');
test('AFIS availability follows airport and controller presence',()=>{assert.equal(rules.afisAvailable('IRFD',['IRFD']),false);assert.equal(rules.afisAvailable('IRFD',[]),true);assert.equal(rules.afisAvailable('IBTH',['IBTH']),true);});
test('AFIS cannot supervise a flight outside its airport',()=>{assert.equal(rules.planAtAirport({aeroport_depart:'IRFD',aeroport_arrivee:'IPPH'},'IBTH'),false);assert.equal(rules.planAtAirport({aeroport_depart:'IRFD',aeroport_arrivee:'IPPH'},'IPPH'),true);});
for(const endpoint of ['options','verify'])test(`direct passkey ${endpoint} is disabled`,async()=>{const route=load(`src/app/api/auth/passkeys/login/${endpoint}/route.ts`,{'next/server':{NextResponse:{json:(body,options)=>({body,status:options.status})}}});assert.equal((await route.POST()).status,410);});
for(const linked of [false,true])test(`Discord ${linked?'logs in without email or passkey':'rejects an unlinked account'}`,async()=>{
 let sessions=0,completed=0;const savedFetch=global.fetch;global.fetch=async url=>({ok:true,json:async()=>url.includes('oauth2/token')?{access_token:'test-token'}:{id:'discord-id',username:'test'}});
 try { const route=load('src/app/auth/discord/callback/route.ts',{
 'next/server':{NextResponse:{redirect:url=>({url:String(url),cookies:{values:{},set(name,value){this.values[name]=value;}}})}},
 'next/headers':{cookies:async()=>({get:name=>({value:name==='discord_oauth_login'?'1':name==='state'?'expected':'/logbook'})})},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:linked?{user_id:'existing-user'}:null})})})},
 '@/lib/discord-link':{DISCORD_OAUTH_STATE_COOKIE:'state',DISCORD_OAUTH_RETURN_COOKIE:'return',hasDiscordOAuthConfig:()=>true,getDiscordOAuthConfig:()=>({clientId:'test',clientSecret:'test',redirectUri:'https://example.test/auth/discord/callback'})},
 '@/lib/auth/session-from-identity':{createSessionFromVerifiedIdentity:async id=>{assert.equal(id,'existing-user');sessions++;return {auth:{signOut:async()=>{}}};}},
 '@/lib/auth/complete-login-verification':{completeLoginVerification:async()=>{completed++;return {ok:true};}}
 });const result=await route.GET({url:'https://example.test/auth/discord/callback?code=test&state=expected'});assert.equal(sessions,linked?1:0);assert.equal(completed,linked?1:0);assert.equal(new URL(result.url).pathname,linked?'/logbook':'/login');if(linked)assert.equal(result.cookies.values.pending_login_verification,'');
 } finally {global.fetch=savedFetch;}
});
