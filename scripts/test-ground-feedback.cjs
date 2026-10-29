const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function api(fetch){const m={exports:{}};new Function('fetch','exports',ts.transpileModule(fs.readFileSync('src/lib/fetch-json.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(fetch,m.exports);return m.exports;}
test('expired session redirects produce a useful error rather than an HTML parse failure',async()=>{const a=api(async()=>({redirected:true,url:'https://example.test/login',json:()=>{throw Error('Should not parse HTML')}}));await assert.rejects(a.fetchJson('/api/private'),/session a expiré/);});
test('server rejection preserves its error message',async()=>{const a=api(async()=>new Response(JSON.stringify({error:'Service déjà demandé'}),{status:409}));await assert.rejects(a.fetchJson('/api/service'),/déjà demandé/);});
test('non-JSON server responses are handled without exposing parsing details',async()=>{const a=api(async()=>new Response('<html>Bad gateway</html>',{status:502}));await assert.rejects(a.fetchJson('/api/service'),/Réponse du serveur illisible/);});
test('successful JSON responses remain unchanged',async()=>{const a=api(async()=>Response.json({ok:true}));assert.deepEqual(await a.fetchJson('/api/service'),{ok:true});});

function groundClient(fail=false){
  const states=[],calls=[];let cursor=0,currentTree;
  const mockReact={
    useState(initial){
      const i=cursor++;
      if(!(i in states))states[i]=typeof initial==='function'?initial():initial;
      return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];
    },
    useEffect(){},useCallback:fn=>fn,
  };
  const m={exports:{}};
  const deps={react:mockReact,'@/lib/supabase/client':{createClient:()=>({})},'@/lib/fetch-json':{fetchJson:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});if(fail)throw Error('Refus du service');return {};}}};
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/app/(app)/logbook/plans-vol/ServicesAuSolPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(name=>deps[name]||require(name),m,m.exports);
  const oldFetch=global.fetch;global.fetch=async()=>new Response('{}',{status:200});
  function walk(el){if(!el||typeof el!=='object')return [];if(Array.isArray(el))return el.flatMap(walk);return [el,...walk(el.props?.children)];}
  function render(){cursor=0;currentTree=m.exports.default({planVolId:'plan-a',aeroportDepart:'IRFD',aeroportArrivee:'ITKO',statut:'depose',porteDepart:null,paxCount:20});return walk(currentTree);}
  render();
  return {
    get tree(){return walk(currentTree);},states,calls,render,
    open(){
      const toggle=this.tree.find(el=>el.type==='button'&&el.props['aria-controls']==='ground-services-content');
      assert.ok(toggle,'Le panneau expose son bouton d’ouverture');
      assert.equal(toggle.props['aria-expanded'],false);
      toggle.props.onClick();
      render();
      assert.equal(this.tree.find(el=>el.type==='button'&&el.props['aria-controls']==='ground-services-content').props['aria-expanded'],true);
    },
    restore(){global.fetch=oldFetch;},
  };
}
function text(el){if(Array.isArray(el))return el.map(text).join('');if(el&&typeof el==='object')return text(el.props?.children);return typeof el==='string'?el:'';}
test('pilot boarding button requests Ground Crew instead of invoking their restricted command',async()=>{const c=groundClient();try{assert.ok(!c.tree.some(el=>el.type==='button'&&text(el).includes('Demander l’embarquement')));c.open();const button=c.tree.find(el=>el.type==='button'&&text(el).includes('Demander l’embarquement'));assert.ok(button);await button.props.onClick();assert.equal(c.calls[0].url,'/api/ground/service-requests');assert.equal(c.calls[0].body.service_type,'boarding');assert.equal(c.calls[0].body.plan_vol_id,'plan-a');assert.equal(c.calls.length,1);assert.ok(!c.calls.some(call=>call.url==='/api/ground/boarding'));c.render();}finally{c.restore();}});
test('ground service rejection is preserved for visible feedback',async()=>{const c=groundClient(true);try{c.open();const button=c.tree.find(el=>el.type==='button'&&text(el).includes('Demander l’embarquement'));await button.props.onClick();assert.ok(c.states.includes('Refus du service'));c.render();assert.ok(c.tree.some(el=>el.props?.role==='alert'&&text(el).includes('Refus du service')),'Le refus reste visible après le nouveau rendu');}finally{c.restore();}});
