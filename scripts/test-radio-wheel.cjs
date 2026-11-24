const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/lib/radio-wheel.ts','utf8'), {
  compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('module','exports',code)(mod,mod.exports);
const { bindRadioWheel } = mod.exports;
function wheel(deltaY, ctrlKey=false) {
  const event = new Event('wheel', { cancelable:true, bubbles:true });
  event.deltaY=deltaY; event.ctrlKey=ctrlKey;
  event.stopPropagation=()=>{ event.stopped=true; };
  return event;
}
test('hovering a knob consumes wheel scrolling without requiring focus, and cleanup restores it',()=>{
  const target=new EventTarget(), changes=[];
  let options;
  const add=target.addEventListener.bind(target);
  target.addEventListener=(type,listener,opts)=>{ options=opts; add(type,listener,opts); };
  const cleanup=bindRadioWheel(target,delta=>changes.push(delta));
  assert.equal(options.passive,false,'browser must allow preventDefault');
  for(const delta of [-100,100]) {
    const event=wheel(delta); target.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true); assert.equal(event.stopped,true);
  }
  assert.deepEqual(changes,[1,-1]);
  cleanup(); const after=wheel(100); target.dispatchEvent(after);
  assert.equal(after.defaultPrevented,false); assert.deepEqual(changes,[1,-1]);
});
test('knob listener leaves page scrolling outside the control and browser zoom intact',()=>{
  const knob=new EventTarget(), page=new EventTarget(), changes=[];
  const cleanup=bindRadioWheel(knob,delta=>changes.push(delta));
  const outside=wheel(100); page.dispatchEvent(outside); assert.equal(outside.defaultPrevented,false);
  const zoom=wheel(-100,true); knob.dispatchEvent(zoom); assert.equal(zoom.defaultPrevented,false);
  assert.deepEqual(changes,[]); cleanup();
});
