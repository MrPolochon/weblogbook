const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>dependencies[name]||require(name),module,module.exports);
  return module.exports;
}
const frequencies=load('src/lib/vhf-frequencies.ts',{});
function route(user, call, allowed=true, transmit=false) {
  const auth={getUser:async()=>({data:{user},error:null})};
  const query={select(){return this;},eq(){return this;},single:async()=>({data:call})};
  return load('src/app/api/realtime/join/route.ts',{
    'next/server':{NextResponse:{json:Response.json}},
    '@/lib/supabase/server':{createClient:async()=>({auth})},
    '@supabase/supabase-js':{createClient:()=>({auth})},
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query})},
    '@/lib/rate-limit-shared':{rateLimitShared:async()=>({allowed})},
    '@/lib/vhf-frequencies':frequencies,
    '@/lib/radio-access':{canTransmitRadio:async()=>transmit},
  }).POST;
}
const request=(body,bearer=false)=>new Request('https://site.test/api/realtime/join',{method:'POST',headers:{'Content-Type':'application/json',...(bearer?{Authorization:'Bearer test-access-token'}:{})},body:JSON.stringify(body)});
test('cookie and native bearer requests must authenticate before joining a frequency',async()=>{
  for(const bearer of [false,true]) assert.equal((await route(null)(request({roomName:'vhf-118935'},bearer))).status,401);
});
test('invalid frequency, malformed call UUID and rate-limited users cannot get tickets',async()=>{
  for(const roomName of ['vhf-1000000','vhf-118.935','call-anything','private-channel']) assert.equal((await route({id:'pilot'})(request({roomName}))).status,400);
  assert.equal((await route({id:'pilot'},null,false)(request({roomName:'vhf-118935'}))).status,429);
});
test('private calls require membership and an active call record',async()=>{
  const roomName='call-12345678-1234-1234-1234-123456789012';
  for(const call of [null,{from_user_id:'other',to_user_id:'atc',status:'connected'},{from_user_id:'pilot',to_user_id:'atc',status:'ended'}]) {
    assert.equal((await route({id:'pilot'},call)(request({roomName}))).status,403);
  }
});
test('packaged Electron may use bearer authentication but opaque origins cannot use web cookies',async()=>{
  const webCookie=request({roomName:'vhf-118935'});
  webCookie.headers.set('origin','null');
  assert.equal((await route({id:'pilot'})(webCookie)).status,401);
  const native=request({roomName:'vhf-118935'},true);
  native.headers.set('origin','null');
  const response=await route({id:'pilot'},null,false)(native);
  assert.equal(response.status,429, 'Bearer user reaches the authenticated rate limiter');
  assert.equal(response.headers.get('access-control-allow-origin'),'null');
  assert.equal(response.headers.get('vary'),'Origin');
});
test('server signs a one-minute ticket accepted by the Worker without exposing SFU secrets',async()=>{
  const keys=['CLOUDFLARE_REALTIME_URL','CLOUDFLARE_REALTIME_SECRET'];
  const before=keys.map(k=>process.env[k]);
  process.env.CLOUDFLARE_REALTIME_URL='wss://radio.test/connect';
  process.env.CLOUDFLARE_REALTIME_SECRET='test-only-signing-secret-at-least-32-characters';
  try {
    const response=await route({id:'pilot'})(request({roomName:'vhf-118935',participantName:'DLH123'},true));
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    const {verifyTicket}=await import('../realtime-worker/src/ticket.mjs');
    const claims=await verifyTicket(body.token,process.env.CLOUDFLARE_REALTIME_SECRET);
    assert.equal(claims.canPublish,false); assert.equal(body.canPublish,false);
    assert.equal(claims.sub,'pilot');assert.equal(claims.room,'vhf-118935');assert.equal(claims.exp-claims.iat,60);
    assert.deepEqual(Object.keys(body).sort(),['canPublish','protocol','provider','token','url']);
    assert.ok(!JSON.stringify(body).includes(process.env.CLOUDFLARE_REALTIME_SECRET));
  } finally { keys.forEach((key,i)=>{if(before[i]===undefined) delete process.env[key];else process.env[key]=before[i];}); }
});

test('OBS cannot request transmission, while flight/post permission is signed and arbitrary frequencies work',async()=>{
  process.env.CLOUDFLARE_REALTIME_URL='wss://radio.test/connect';
  process.env.CLOUDFLARE_REALTIME_SECRET='test-only-signing-secret-at-least-32-characters';
  try {
    for (const [transmit,observer,expected] of [[false,false,false],[true,false,true],[true,true,false]]) {
      const response=await route({id:'pilot'},null,true,transmit)(request({roomName:'vhf-999999',observer}));
      assert.equal(response.status,200);
      const body=await response.json();
      const claims=JSON.parse(Buffer.from(body.token.split('.')[1],'base64url'));
      assert.equal(claims.canPublish,expected); assert.equal(body.canPublish,expected);
    }
  } finally { delete process.env.CLOUDFLARE_REALTIME_URL; delete process.env.CLOUDFLARE_REALTIME_SECRET; }
});
