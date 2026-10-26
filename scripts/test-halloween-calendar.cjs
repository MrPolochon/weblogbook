const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const m = { exports: {} };
new Function('module','exports',ts.transpileModule(fs.readFileSync('src/lib/halloween-calendar.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports);
const { halloweenCalendar: calendar, untilNextUtcDay } = m.exports;
test('Halloween grows every UTC day from 26 through 31 October',()=>{
 let previous=0;
 for(let day=26;day<=31;day++) {
  const result=calendar(new Date(`2026-10-${day}T00:00:00Z`));
  assert.equal(result.stage,day-25); assert.ok(result.decorations>previous);
  assert.equal(result.finale,day===31); previous=result.decorations;
 }
});
test('UTC midnight activates the finale regardless of visitor time zone',()=>{
 assert.equal(calendar(new Date('2026-10-30T23:59:59.999Z')).finale,false);
 assert.equal(calendar(new Date('2026-10-30T14:00:00-10:00')).finale,true);
 assert.equal(untilNextUtcDay(new Date('2026-10-30T23:59:59.999Z')),1);
 assert.equal(untilNextUtcDay(new Date('2026-10-31T00:00:00Z')),86400000);
});
test('The finale ends on 1 November and stays off outside October',()=>{
 for(const date of ['2026-10-25','2026-11-01','2026-12-31','2027-01-31']) assert.deepEqual(calendar(new Date(date)),{stage:0,finale:false,decorations:0});
});
test('The finale renders its greeting and fireworks behind a non-interactive scene',()=>{
 const React=require('react');
 const {renderToStaticMarkup}=require('react-dom/server');
 function render(finale){
  const component={exports:{}};
  const code=ts.transpileModule(fs.readFileSync('src/components/HalloweenScene.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>name==='react'?{...React,useEffect:()=>{},useState:()=>[{stage:finale?6:1,finale,decorations:finale?36:6}]}:name==='@/lib/halloween-calendar'?m.exports:require(name),component,component.exports);
  return renderToStaticMarkup(React.createElement(component.exports.default));
 }
 const ordinary=render(false),finale=render(true);
 assert.equal((ordinary.match(/class="login-halloween-object /g)||[]).length,6);
 assert.equal((finale.match(/class="login-halloween-object /g)||[]).length,36);
 assert.ok(!ordinary.includes('login-halloween-greeting'));
 assert.ok(finale.includes('<span>Happy</span><strong>Halloween</strong>'));
 assert.equal((finale.match(/class="login-halloween-firework"/g)||[]).length,6);
 assert.ok(finale.includes('aria-hidden="true"'));
 assert.ok(fs.readFileSync('src/app/globals.css','utf8').includes('overflow: hidden; pointer-events: none;'));
});
