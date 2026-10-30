const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
function load(file,deps={},globals={}){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',...Object.keys(globals),js)(name=>deps[name]??require(name),m.exports,...Object.values(globals));return m.exports;}
function mount(extra={}){
  const slots=[],effects=[],requests=[];let cursor=0,dirty=true,tree;
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(slots[i],next)){slots[i]=next;dirty=true;}}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useCallback(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n])))slots[i]={deps,value:fn};return slots[i].value;},useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n]))){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
  const fleet=[{id:'aircraft-a',immatriculation:'F-TEST',aeroport_actuel:'IRFD',statut:'ground',usure_percent:100},{id:'leased-out',immatriculation:'F-LEASED',aeroport_actuel:'IRFD',statut:'ground',usure_percent:100,location_status:'leased_out'}];
  let itineraries=extra.itineraries??[];
  const fetchJson=async(url,init)=>{requests.push({url,init});if(init?.method==='POST'){if(url.endsWith('/annuler'))itineraries=itineraries.map(it=>({...it,status:'cancelled',can_resume:false,can_cancel:false}));return {ok:true,id:'itinerary-a'};}return url.startsWith('/api/compagnies/avions')?fleet:{unlocked:true,itineraries};};
  const component=load('src/components/company/CompanyItineraries.tsx',{react,'next/link':{default:()=>null},'@/lib/fetch-json':{fetchJson},'@/lib/aeroports-ptfs':load('src/lib/aeroports-ptfs.ts'),'@/lib/compagnie-utils':load('src/lib/compagnie-utils.ts'),'./CompanyItineraries.module.css':{default:new Proxy({},{get:(_,key)=>key})}},{crypto:{randomUUID:()=> 'request-id'}}).default;
  const props={compagnieId:'company-a',canManage:true,unlocked:true,...extra.props};
  function render(){let loops=0;do{dirty=false;cursor=0;tree=component(props);for(const effect of effects.splice(0))effect();assert.ok(++loops<20);}while(dirty);return tree;}
  const c={requests,render,all:()=>walk(tree),find:fn=>walk(tree).find(fn),get text(){return text(tree);},button(label){return this.find(node=>node.type==='button'&&(text(node)===label||node.props['aria-label']===label));},click(label){const node=this.button(label);assert.ok(node,label);assert.ok(!node.props.disabled,label);node.props.onClick();render();},field(label){return this.find(node=>node.props?.['aria-label']===label);},change(label,value){const node=this.field(label);assert.ok(node,label);node.props.onChange({target:{value}});render();},async flush(){await new Promise(resolve=>setImmediate(resolve));render();},async submit(){this.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await this.flush();},cleanup(){for(const s of slots)s?.cleanup?.();}};render();return c;
}

test('itineraries remain hidden and never load before the completed research or for employees',()=>{
  for(const props of [{unlocked:false},{canManage:false}]){const c=mount({props});try{assert.equal(c.text,'');assert.equal(c.requests.length,0);}finally{c.cleanup();}}
});

test('planning two to five connected legs saves a route without creating or paying a flight',async()=>{
  const c=mount();try{
    await c.flush();c.click('Nouvel itinéraire');c.change('Appareil de l’itinéraire','aircraft-a');c.change('Indicatif de l’itinéraire','AFR123');
    c.change('Destination du tronçon 1','ITKO');c.change('Destination du tronçon 2','IPPH');
    c.click('Ajouter une escale (2/5 tronçons)');c.change('Destination du tronçon 2','ILAR');
    assert.match(c.text,/Arrivée finale/);assert.equal(c.field('Destination du tronçon 3').props.value,'IPPH');
    c.click('Ajouter une escale (3/5 tronçons)');c.change('Destination du tronçon 3','ISAU');
    c.click('Ajouter une escale (4/5 tronçons)');c.change('Destination du tronçon 4','IBTH');
    assert.equal(c.button('Ajouter une escale (5/5 tronçons)'),undefined);await c.submit();
    const posts=c.requests.filter(r=>r.init?.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].url,'/api/compagnies/company-a/itineraires');
    const body=JSON.parse(posts[0].init.body);assert.equal(body.request_id,'request-id');assert.equal(body.compagnie_avion_id,'aircraft-a');assert.equal(body.aeroport_depart,'IRFD');assert.equal(body.numero_vol,'AFR123');assert.deepEqual(body.segments.map(leg=>leg.aeroport_arrivee),['ITKO','ILAR','ISAU','IBTH','IPPH']);
    assert.equal(c.requests.some(r=>r.url==='/api/plans-vol'||r.url==='/api/plans-vol/devis'),false);assert.match(c.text,/Itinéraire enregistré/);
  }finally{c.cleanup();}
});

test('paused itinerary exposes the next classic deposit, final destination and cancellation confirmation',async()=>{
  const itinerary={id:'itinerary-a',company_id:'company-a',aircraft_id:'aircraft-a',flight_number:'AFR123',nature_transport:'passagers',origin:'ILAR',destination:'IPPH',status:'paused',next_leg_index:2,can_resume:true,can_cancel:true,legs:[{id:'leg-a',leg_index:1,origin:'ILAR',destination:'IRFD',status:'completed',plan_id:'plan-a',preparation:{type_vol:'VFR',temps_prev_min:30}},{id:'leg-b',leg_index:2,origin:'IRFD',destination:'IPPH',status:'planned',plan_id:null,preparation:{type_vol:'IFR',temps_prev_min:45}}]};
  const c=mount({itineraries:[itinerary]});try{
    await c.flush();assert.match(c.text,/Destination finale : IPPH/);assert.match(c.text,/1\/2 tronçons clôturés/);assert.match(c.text,/Escale à IRFD/);
    assert.ok(c.find(node=>node.props?.href==='/logbook/depot-plan-vol?itinerary=itinerary-a'));assert.ok(c.find(node=>node.props?.href==='/logbook/plans-vol/plan-a'));
    c.click('Annuler les tronçons restants');assert.equal(c.requests.filter(r=>r.init?.method==='POST').length,0);c.click('Confirmer l’annulation');await c.flush();assert.equal(c.requests.filter(r=>r.init?.method==='POST')[0].url,'/api/itineraires/itinerary-a/annuler');assert.match(c.text,/Les tronçons restants ont été annulés/);
  }finally{c.cleanup();}
  const other=mount({itineraries:[{...itinerary,can_resume:false,can_cancel:false}]});try{await other.flush();assert.equal(other.find(node=>node.props?.href==='/logbook/depot-plan-vol?itinerary=itinerary-a'),undefined);assert.equal(other.button('Annuler les tronçons restants'),undefined);}finally{other.cleanup();}
});

test('the pilot plans page keeps the final destination and offers the next leg only after the active flight is closed',()=>{
  const component=load('src/components/company/PilotItineraryProgress.tsx',{'next/link':{default:'a'},'./CompanyItineraries.module.css':{default:new Proxy({},{get:(_,key)=>key})}}).default;
  const itinerary={id:'itinerary-a',company_id:'company-a',flight_number:'AFR123',origin:'ILAR',destination:'IPPH',status:'paused',next_leg_index:2,legs:[{id:'leg-a',leg_index:1,origin:'ILAR',destination:'IRFD',status:'completed',plan_id:'plan-a'},{id:'leg-b',leg_index:2,origin:'IRFD',destination:'IPPH',status:'planned',plan_id:null}]};
  const ready=component({itineraries:[itinerary],hasActivePlan:false});assert.match(text(ready),/Destination finale : IPPH/);assert.match(text(ready),/Tronçon précédent clôturé/);assert.match(text(ready),/Préparer le tronçon 2/);assert.ok(walk(ready).some(node=>node.props?.href==='/logbook/depot-plan-vol?itinerary=itinerary-a'));
  const blocked=component({itineraries:[itinerary],hasActivePlan:true});assert.equal(walk(blocked).some(node=>node.props?.href==='/logbook/depot-plan-vol?itinerary=itinerary-a'),false);assert.equal(component({itineraries:[],hasActivePlan:false}),null);
});
