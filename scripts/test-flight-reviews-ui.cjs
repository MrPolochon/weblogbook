const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const limits={exports:{}};new Function('exports',ts.transpileModule(fs.readFileSync('src/lib/flight-reviews-feed.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(limits.exports);
const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
function mount(){
  const slots=[],effects=[],requests=[],events={window:new Map(),document:new Map()};let cursor=0,dirty=true,tree,now=Date.now();
  const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{const next=typeof v==='function'?v(slots[i]):v;if(!Object.is(slots[i],next)){slots[i]=next;dirty=true;}}];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useCallback(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n])))slots[i]={deps,value:fn};return slots[i].value;},useEffect(fn,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((value,n)=>!Object.is(value,old.deps[n]))){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}}};
  const surface=name=>({addEventListener:(nameEvent,fn)=>events[name].set(nameEvent,fn),removeEventListener:nameEvent=>events[name].delete(nameEvent)});
  const doc={...surface('document'),visibilityState:'visible'};
  const m={exports:{}};
  const source=ts.transpileModule(fs.readFileSync('src/components/FlightReviewFeed.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','exports','fetch','window','document','Date',source)(name=>name==='react'?react:name==='@/lib/flight-reviews-feed'?limits.exports:require(name),m.exports,(url,init)=>new Promise((resolve,reject)=>requests.push({url,init,resolve,reject})),surface('window'),doc,class extends Date{static now(){return now;}});
  function render(){let loops=0;do{dirty=false;cursor=0;tree=m.exports.default();for(const effect of effects.splice(0))effect();assert.ok(++loops<20);}while(dirty);return tree;}
  const c={requests,all:()=>walk(tree),find:fn=>walk(tree).find(fn),get text(){return text(tree);},button(label){return this.find(node=>node.type==='button'&&text(node)===label);},click(label){const button=this.button(label);assert.ok(button,label);assert.ok(!button.props.disabled);button.props.onClick();render();},search(value){this.find(node=>node.type==='input').props.onChange({target:{value}});render();},submit(){this.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});render();},async flush(){await new Promise(resolve=>setImmediate(resolve));render();},async complete(index,reviews=[],next=null){requests[index].resolve(Response.json({reviews,next,feed_limit:500}));await this.flush();},visibility(value){doc.visibilityState=value;now+=2000;events.document.get('visibilitychange')?.();render();},focus(){now+=2000;events.window.get('focus')?.();render();},cleanup(){for(const slot of slots)slot?.cleanup?.();assert.equal(events.window.size,0);assert.equal(events.document.size,0);}};render();return c;
}
const review={id:'review-a',author_label:'Voyageur virtuel',body:'Une arrivée ponctuelle avec Air Test.',sentiment:'positif',rating:5,created_at:'2026-10-30T04:30:00Z'};

test('a previously empty feed refreshes when the pilot returns after the flight',async()=>{
  const c=mount();try{
    await c.complete(0);assert.match(c.text,/Aucune publication/);assert.match(c.text,/clôture et le règlement/);
    c.visibility('hidden');assert.equal(c.requests.length,1);c.visibility('visible');assert.equal(c.requests.length,2);assert.equal(c.requests[1].init.cache,'no-store');
    await c.complete(1,[review]);assert.match(c.text,/Une arrivée ponctuelle/);assert.doesNotMatch(c.text,/Aucune publication/);
    c.focus();assert.equal(c.requests.length,3);await c.complete(2,[review]);
  }finally{c.cleanup();}
});

test('refresh and repeating the same search both fetch new reviews without changing filters',async()=>{
  const c=mount();try{
    await c.complete(0);c.click('Actualiser les avis');assert.equal(c.requests.length,2);await c.complete(1);
    c.submit();assert.equal(c.requests.length,3);await c.complete(2);
    c.search('Air Test');c.submit();assert.equal(c.requests.length,4);assert.match(c.requests[3].url,/q=Air\+Test/);await c.complete(3);
    assert.match(c.text,/Aucun avis ne correspond à ces filtres/);assert.doesNotMatch(c.text,/Aucune publication pour le moment/);
    c.submit();assert.equal(c.requests.length,5);assert.match(c.requests[4].url,/q=Air\+Test/);await c.complete(4,[review]);assert.match(c.text,/Une arrivée ponctuelle/);
  }finally{c.cleanup();}
});

test('filtered emptiness can be cleared and is never reported as an empty public feed',async()=>{
  const c=mount();try{
    await c.complete(0,[review]);c.click('Déceptions');await c.complete(1);assert.match(c.text,/Aucun avis ne correspond à ces filtres/);
    c.click('Effacer les filtres');assert.match(c.requests[2].url,/sentiment=&q=/);await c.complete(2,[review]);assert.match(c.text,/Une arrivée ponctuelle/);
  }finally{c.cleanup();}
});

test('a thirty-review flight batch survives pagination and a refresh replaces reviews removed from retention',async()=>{
  const c=mount();try{
    const batch=Array.from({length:30},(_,index)=>({...review,id:`batch-${index}`,author_label:`Voyageur ${index+1}`,body:`Expérience du voyageur ${index+1}.`}));
    const cursor=`${review.created_at}|batch-24`;
    await c.complete(0,batch.slice(0,25),cursor);assert.equal(c.all().filter(node=>node.type==='article').length,25);
    c.click('Voir les publications précédentes');assert.equal(new URL(c.requests[1].url,'https://example.test').searchParams.get('before'),cursor);
    await c.complete(1,batch.slice(24));assert.equal(c.all().filter(node=>node.type==='article').length,30);assert.match(c.text,/Expérience du voyageur 30/);
    c.click('Actualiser les avis');await c.complete(2,[{...review,id:'new-retained-review',body:'Publication conservée après actualisation.'}]);
    assert.equal(c.all().filter(node=>node.type==='article').length,1);assert.doesNotMatch(c.text,/Expérience du voyageur/);assert.match(c.text,/Publication conservée/);
  }finally{c.cleanup();}
});

test('the public list stops at five hundred reviews even when pages retain a stale next cursor',async()=>{
  const c=mount();try{
    for(let page=0;page<20;page++){
      if(page)c.click('Voir les publications précédentes');
      const rows=Array.from({length:25},(_,index)=>({...review,id:`retained-${page*25+index}`,body:`Publication ${page*25+index+1}.`}));
      await c.complete(page,rows,`cursor-${page}`);
    }
    assert.equal(c.all().filter(node=>node.type==='article').length,500);
    assert(!c.button('Voir les publications précédentes'));
    assert.equal(c.requests.length,20);
  }finally{c.cleanup();}
});
