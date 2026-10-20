const { test } = require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
test('public event reading does not exempt mutations or admin pages',()=>{
  const {isPublicMajorEventPath}=load('src/lib/events/public-paths.ts');
  for(const path of ['/api/evenements/bandeau','/api/evenements/reservations','/evenements/12345678-1111-4111-8111-111111111111']) {
    assert.equal(isPublicMajorEventPath(path,'GET'),true);
    for(const method of ['POST','PATCH','DELETE']) assert.equal(isPublicMajorEventPath(path,method),false);
  }
  assert.equal(isPublicMajorEventPath('/admin/evenements-majeurs','GET'),false);
  assert.equal(isPublicMajorEventPath('/api/evenements/reservations/private-id','GET'),false);
});
function load(file,deps={}) {const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>deps[n]||require(n),mod,mod.exports);return mod.exports;}
const {eventBannerState,csvCell,majorConfigSchema,reservationSchema,majorConfigError}=load('src/lib/events/rules.ts',{
  '@/lib/aeroports-ptfs':{CODES_OACI_VALIDES:new Set(['ITKO','IRFD'])},'@/lib/atc-positions':{ATC_POSITIONS:['Tower','Ground']}
});
test('banner appears exactly 24 hours ahead, switches to active and disappears at the end',()=>{
  const start='2026-10-19T18:00:00Z',end='2026-10-19T20:00:00Z';
  assert.equal(eventBannerState(start,end,true,Date.parse(start)-86400001),null);
  assert.equal(eventBannerState(start,end,true,Date.parse(start)-86400000),'upcoming');
  assert.equal(eventBannerState(start,end,true,Date.parse(start)),'active');
  assert.equal(eventBannerState(start,end,true,Date.parse(end)),null);
  assert.equal(eventBannerState(start,end,false,Date.parse(start)),null);
});
test('major config requires valid airports and bounded capacities',()=>{
  const config={airports:['itko'],slot_minutes:10,pilot_capacity:5,atc_positions:['Tower']};
  assert.deepEqual(majorConfigSchema.parse(config).airports,['ITKO']);
  assert.equal(majorConfigSchema.safeParse({...config,airports:[]}).success,false);
  assert.equal(majorConfigSchema.safeParse({...config,pilot_capacity:0}).success,false);
  assert.equal(majorConfigSchema.safeParse({...config,slot_minutes:3}).success,false);
});
test('700 movements and invalid fields produce actionable French messages; capacity 100 is accepted',()=>{
  const valid={airports:['ITKO'],slot_minutes:10,pilot_capacity:100,atc_positions:['Tower']};
  assert.equal(majorConfigSchema.safeParse(valid).success,true);
  for(const value of [700,0,1.5,null]) {
    const parsed=majorConfigSchema.safeParse({...valid,pilot_capacity:value});assert.equal(parsed.success,false);
    const text=majorConfigError(parsed.error);assert.match(text,/1 et 100 mouvements par aéroport/);assert.match(text,/pas le total/);assert.doesNotMatch(text,/Invalid input/);
  }
  const multiple=majorConfigSchema.safeParse({...valid,airports:[],slot_minutes:0,atc_positions:[]});
  const text=majorConfigError(multiple.error);assert.match(text,/Aéroports/);assert.match(text,/5 et 60/);assert.match(text,/Positions ATC/);
});
test('pilot reservations need a route, callsign, aircraft and event; ATC reservations need a position',()=>{
  const reservation={event_id:null,role:'pilot',airport:'ITKO',starts_at:'2026-10-19T18:00:00Z',ends_at:'2026-10-19T18:10:00Z'};
  assert.equal(reservationSchema.safeParse(reservation).success,false);
  assert.equal(reservationSchema.safeParse({...reservation,role:'atc',position:'Tower'}).success,true);
  assert.equal(reservationSchema.safeParse({...reservation,role:'atc',position:'Wrong'}).success,false);
});
test('CSV export neutralises formulas and preserves quoted text',()=>{
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('AFR123'),'"AFR123"');assert.equal(csvCell('a;b'),'"a;b"');
});
