const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const ts = require('typescript');
function load(path,deps={}) { const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name]??require(name),m,m.exports);return m.exports; }
const rules=load('src/lib/tribunal-bulletins.ts');
test('bulletins validate categories, trim content and reject invalid or oversized text',()=>{
 assert.deepEqual(rules.validateBulletin({title:' Loi nouvelle ',content:' Texte officiel à publier. ',category:'Loi'}),{title:'Loi nouvelle',content:'Texte officiel à publier.',category:'Loi'});
 for(const body of [null,{}, {title:'Loi',content:'Court',category:'Loi'}, {title:'Loi',content:'Texte officiel',category:'Autre'}, {title:'Loi',content:'a'.repeat(50001),category:'Loi'}]) assert.equal(rules.validateBulletin(body),null);
});
test('only archive URLs are public; admin and publishing routes remain protected',()=>{
 assert.equal(rules.isPublicBulletinPath('/journal'),true);
 assert.equal(rules.isPublicBulletinPath('/journal/11111111-1111-1111-1111-111111111111'),true);
 for(const path of ['/journal/gerer','/admin/documents/journal','/api/tribunal/bulletins','/journal/11111111-1111-1111-1111-111111111111/edit'])assert.equal(rules.isPublicBulletinPath(path),false);
});
function route(role,authenticated=true,error=null){let published=0;const supabase={auth:{getUser:async()=>({data:{user:authenticated?{id:'user'}:null}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{role}})}),rpc:async()=>{published++;return {data:'bulletin-id',error};}};return {get count(){return published},api:load('src/app/api/tribunal/bulletins/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/supabase/server':{createClient:async()=>supabase},'@/lib/tribunal-bulletins':rules})};}
const request={json:async()=>({title:'Communiqué officiel',category:'Communiqué',content:'Information officielle du tribunal.'})};
test('anonymous users and non-admins cannot publish',async()=>{for(const r of [route('admin',false),route('pilote')]){assert.ok([401,403].includes((await r.api.POST(request)).status));assert.equal(r.count,0);}});
test('administrators publish through the authorized database function',async()=>{const r=route('admin');assert.equal((await r.api.POST(request)).status,201);assert.equal(r.count,1);});
test('invalid JSON and database failures never report successful publication',async()=>{const bad=route('admin');assert.equal((await bad.api.POST({json:async()=>{throw Error('invalid')}})).status,400);assert.equal(bad.count,0);const failed=route('admin',true,{message:'offline'});assert.equal((await failed.api.POST(request)).status,503);});
