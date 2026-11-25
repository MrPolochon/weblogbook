const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,deps={}){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(name=>deps[name]||require(name),mod,mod.exports);return mod.exports;}
const directory=load('src/lib/official-vhf.ts');
const frequencies=load('src/lib/vhf-frequencies.ts');
const airports=load('src/lib/aeroports-ptfs.ts').AEROPORTS_PTFS;

test('official assignments reproduce the supplied ATC and AFIS list',()=>{
 const expected={
  IRFD:['Center=125.050','APP=120.775','Tower=118.925','DEP=121.985','Ground=121.700','Delivery=118.455'],
  IMLR:['APP=125.700','Tower=125.800','Ground=125.225'],ITRC:['Tower=119.075','Ground=121.725'],
  IBTH:['AFIS=127.825'],ITKO:['Center=124.850','APP=124.200','Tower=118.100','Ground=121.700'],IDCS:['AFIS=127.825'],
  IPPH:['Center=125.455','APP=118.700','Tower=127.400','Ground=121.700'],ILKL:['AFIS=127.825'],
  IZOL:['Center=125.640','APP=124.300','Tower=119.150','Ground=121.750'],IJAF:['AFIS=127.825'],ISCM:['AFIS=127.925'],
  ILAR:['Center=127.525','APP=119.950','Tower=122.900','Ground=122.225'],IPAP:['APP=120.150','Tower=118.575','Ground=121.650'],
  IIAB:['APP=120.850','Tower=118.100','Ground=121.300'],IHEN:['AFIS=124.975'],
  ISAU:['Center=123.000','APP=123.100','Tower=123.200','Ground=123.300'],IKFL:['Center=126.100','APP=126.700','Tower=126.800','Ground=126.225'],ITEY:['AFIS=127.925']
 };
 for(const [airport,entries] of Object.entries(expected))for(const entry of entries){const [position,freq]=entry.split('=');assert.equal(directory.getOfficialFrequency(airport,position),freq);}
 assert.equal(directory.getOfficialFrequency(' irfd ','CLAIRANCE'),'118.455');
 assert.equal(directory.getOfficialFrequency('IRFD','TWR'),'118.925');
 assert.equal(directory.getOfficialFrequency('IBLT','Delivery'),null);
 assert.equal(directory.getOfficialFrequency('IJAF','Tower'),null,'do not invent an ATC assignment for an AFIS airport');
});
test('every airport has a distinct valid RAMP frequency, separate from ATC and AFIS',()=>{
 const ramp=Object.values(directory.RAMP_FREQUENCIES);
 assert.equal(new Set(ramp).size,airports.length);
 for(const airport of airports)assert.ok(directory.RAMP_FREQUENCIES[airport.code],airport.code);
 const atc=new Set(directory.OFFICIAL_VHF_ASSIGNMENTS.filter(row=>row.position!=='RAMP').map(row=>row.frequency));
 for(const frequency of ramp){assert.ok(frequencies.isValidVhfFrequency(frequency));assert.ok(!atc.has(frequency));}
 for(const row of directory.OFFICIAL_VHF_ASSIGNMENTS)assert.ok(frequencies.isValidVhfFrequency(row.frequency),JSON.stringify(row));
 assert.equal(ramp[0],'131.000');assert.equal(ramp.at(-1),'131.625');
});
test('published directory retires obsolete positions without mutating stored custom assignments',()=>{
 const stored=[{id:'1',aeroport:'IJAF',position:'Tower',frequency:'118.275'},{id:'2',aeroport:'IRFD',position:'Tower',frequency:'119.000'},
 {id:'3',aeroport:'IBLT',position:'Tower',frequency:'119.050'},{id:'4',aeroport:'IRFD',position:'RAMP',frequency:'119.350'}];
 const published=directory.publishedRadioAssignments(stored);
 assert.equal(published.find(row=>row.aeroport==='IRFD'&&row.position==='Tower').frequency,'118.925');
 assert.equal(published.find(row=>row.aeroport==='IRFD'&&row.position==='RAMP').frequency,'131.000');
 assert.equal(published.some(row=>row.aeroport==='IJAF'&&row.position==='Tower'),false);
 assert.ok(published.includes(stored[2]));assert.equal(stored[0].frequency,'118.275');
});
test('server lookups share official assignments and query the DB only for unlisted airports',async()=>{
 const {lookupRadioFrequency}=load('src/lib/radio-directory.ts',{'@/lib/official-vhf':directory});
 let queries=0;const admin={from(){queries++;return{select(){return this},eq(){return this},async maybeSingle(){return{data:{frequency:'119.050'}}}}}};
 assert.equal(await lookupRadioFrequency(admin,'IRFD','Ground'),'121.700');
 assert.equal(await lookupRadioFrequency(admin,'IJAF','Tower'),null);
 assert.equal(queries,0);
 assert.equal(await lookupRadioFrequency(admin,'IBLT','Tower'),'119.050');assert.equal(queries,1);
});
test('an active Ground Crew session grants transmit permission; no session and AFIS=false do not',async()=>{
 for(const active of [null,'ground_sessions','atc_sessions','afis_sessions','siavi_only']){
  const admin={from(table){const query={filters:{},select(){return this},eq(key,value){this.filters[key]=value;return this},or(){return this},in(){return this},async limit(){
   if(table==='afis_sessions')assert.equal(this.filters.est_afis,true,'SIAVI sessions without AFIS do not grant radio transmission');
   const matches=table===active||(active==='siavi_only'&&table==='afis_sessions'&&this.filters.est_afis!==true);
   return{data:matches?[{id:'s'}]:[],error:null};}};return query;}};
  const {canTransmitRadio}=load('src/lib/radio-access.ts',{'@/lib/supabase/admin':{createAdminClient:()=>admin}});
  assert.equal(await canTransmitRadio('user'),active!==null&&active!=='siavi_only');
 }
});
