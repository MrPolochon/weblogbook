const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/lib/siavi/mission-routing.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(require,m,m.exports);
const {medevacRoutingError:validate,MEDEVAC_HOSPITALS}=m.exports;
const legs=(...codes)=>codes.slice(1).map((end,i)=>({aeroport_depart:codes[i],aeroport_arrivee:end}));
for(const [label,type,codes,bases] of [
 ['pickup at IBTH and hospital in Tokyo','evacuation',['IRFD','IBTH','ITKO'],['IRFD']],
 ['pickup at Keflavik, Mellor hospital, return to base','evacuation',['IRFD','IKFL','IMLR','IRFD'],['IRFD']],
 ['local reconnaissance at the base','service',['IRFD','IRFD'],['IRFD']],
 ['hospital to base without evacuation','service',['ITKO','IRFD'],['IRFD']],
 ['new mission starting from a hospital','evacuation',['ITKO','IBTH','IPPH'],['IRFD']],
 ['purchased base is a valid end even without hospital','evacuation',['IRFD','IKFL'],['IRFD','IKFL']],
 ['transfer between purchased bases','service',['IRFD','IKFL'],['IRFD','IKFL']],
])test(label,()=>assert.equal(validate(type,legs(...codes),bases),null));
for(const [label,type,codes,bases] of [
 ['pickup cannot finish the mission','evacuation',['IRFD','IBTH'],['IRFD']],
 ['nonmedical flight cannot finish at hospital','service',['IRFD','ITKO'],['IRFD']],
 ['hospital loop is not a base loop','service',['ITKO','ITKO'],['IRFD']],
 ['no arbitrary stop in nonmedical itinerary','service',['IRFD','IBTH','IRFD'],['IRFD']],
 ['medical loop outside a base is rejected','evacuation',['ITKO','ITKO'],['IRFD']],
 ['hospital code alone does not create a purchased base','service',['ITKO','IRFD'],[]],
])test(label,()=>assert.ok(validate(type,legs(...codes),bases)));
test('mission must remain connected',()=>assert.ok(validate('evacuation',[...legs('IRFD','IBTH'),...legs('IKFL','ITKO')],['IRFD'])));
test('all named hospitals are registered with their airport',()=>assert.deepEqual(Object.keys(MEDEVAC_HOSPITALS).sort(),['IRFD','IPPH','IPAP','ISCM','IMLR','ITKO'].sort()));

test('same-base reconnaissance must be declared as service, not evacuation',()=>assert.ok(validate('evacuation',legs('IRFD','IRFD'),['IRFD'])));

test('nonmedical departure outside bases and hospitals is rejected',()=>assert.ok(validate('service',legs('IBTH','IRFD'),['IRFD'])));
