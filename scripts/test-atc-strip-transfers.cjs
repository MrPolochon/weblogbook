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
 const res=await loadApi()(new Request('http://localhost/api/atc/strips'));assert.equal(res.status,200);assert.equal(res.body.strips[0].id,'flight');
});
test('a failed fallback does not clear the console with a successful empty list',async()=>{
 const res=await loadApi(true)(new Request('http://localhost/api/atc/strips'));assert.equal(res.status,503);assert.equal(res.body.strips,undefined);
});

function loadObserverApi({ role = 'admin', online = true, fallback = false } = {}) {
  const queriedHolders = [];
  let sessionQueries = 0;
  const admin = {
    from(table) {
      const filters = {};
      const query = {
        select() { return this; },
        eq(field, value) { filters[field] = value; return this; },
        or() { return this; },
        in() { return this; },
        maybeSingle() {
          sessionQueries += 1;
          return Promise.resolve({ data: online ? { id: 'session', aeroport: 'IZOL', position: 'Tower', started_at: '2026-11-08T10:00:00Z' } : null });
        },
        order() {
          queriedHolders.push(filters.current_holder_user_id);
          if (fallback && this.joins) return Promise.resolve({ data: null, error: { message: 'Missing join' } });
          return Promise.resolve({ data: [{ id: 'observed-flight', numero_vol: 'TEST1', statut: 'accepte', current_holder_user_id: filters.current_holder_user_id }], error: null });
        },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      query.select = function (columns) { this.joins = columns.includes('compagnie_avion:'); return this; };
      return query;
    },
  };
  const dependencies = {
    '@/lib/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } } }) },
      from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { role } }) }),
    }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, ok: !options?.status || options.status < 400, json: async () => body }) } },
    '@/lib/wake-turbulence': { getTypeWake: () => 'M' },
  };
  const module = { exports: {} };
  new Function('require', 'exports', 'module', apiCode)(name => dependencies[name], module.exports, module);
  return { get: module.exports.GET, queriedHolders, sessionQueries: () => sessionQueries };
}

test('an administrator loads the observed controller strips and session, not their own', async () => {
  const api = loadObserverApi();
  const response = await api.get(new Request('http://localhost/api/atc/strips?observer=controller'));
  assert.equal(response.status, 200);
  assert.deepEqual(api.queriedHolders, ['controller']);
  assert.equal(response.body.strips[0].current_holder_user_id, 'controller');
  assert.equal(response.body.observation.session.aeroport, 'IZOL');
});

test('a non-admin cannot read another controller through the observer parameter', async () => {
  const api = loadObserverApi({ role: 'atc' });
  const response = await api.get(new Request('http://localhost/api/atc/strips?observer=controller'));
  assert.equal(response.status, 403);
  assert.equal(api.sessionQueries(), 0);
  assert.deepEqual(api.queriedHolders, []);
});

test('observation stops when the controller is no longer online', async () => {
  const api = loadObserverApi({ online: false });
  const response = await api.get(new Request('http://localhost/api/atc/strips?observer=controller'));
  assert.equal(response.status, 404);
  assert.deepEqual(api.queriedHolders, []);
});

test('the legacy fallback retains the observed controller and session', async () => {
  const api = loadObserverApi({ fallback: true });
  const response = await api.get(new Request('http://localhost/api/atc/strips?observer=controller'));
  assert.equal(response.status, 200);
  assert.deepEqual(api.queriedHolders, ['controller', 'controller']);
  assert.equal(response.body.observation.session.aeroport, 'IZOL');
});

