const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), source)(name => dependencies[name], module, module.exports, ...Object.values(globals));
  return module.exports;
}
const games = load('src/lib/gameplay.ts');
const scores = load('src/lib/ground/minigames.ts');
test('boarding preserves the exact passenger count, including small cabins', () => {
  for (const count of [0, 1, 2, 3, 4, 50, 350]) {
    const values = Object.values(games.boardingDistribution(count));
    assert.equal(values.reduce((a,b) => a+b, 0), count);
    assert.ok(values.every(n => n >= 0 && Number.isInteger(n)));
  }
});
test('all wing cells that can contain ice are rendered', () => {
  for(let i=0;i<110;i++) assert.equal(games.wingCellVisible(i), i%22 < Math.round(22-Math.floor(i/22)*4.4*.3));
  assert.equal(games.wingCellVisible(109), false);
});
test('perfect baggage handling can achieve 100% when the timer expires', () => {
  assert.equal(scores.calculerScoreBagages(40,40,0,30),1);
  assert.equal(scores.calculerScoreBagages(20,40,0,30),.5);
  assert.equal(scores.calculerScoreBagages(0,0,0,30),0);
});
test('shuffling preserves cards and leaves the input unchanged', () => {
  const original = [1,2,3,4,5];
  for(let i=0;i<50;i++) assert.deepEqual(games.shuffle(original).sort(),original);
  assert.deepEqual(original,[1,2,3,4,5]);
});
test('deadline uses the latest result, catches up after hidden tabs, expires once and cleans up', () => {
  let now=0, interval, event, effect, layout, ref;
  let cleaned=0, expired=0, result=0, ticks=[];
  const react={useRef(value){return ref ??= {current:value};},useLayoutEffect(fn){layout=fn;},useEffect(fn){effect=fn;}};
  const {useGameDeadline}=load('src/lib/use-game-deadline.ts',{react},{
    performance:{now:()=>now},setInterval(fn){interval=fn;return 7;},clearInterval(id){assert.equal(id,7);cleaned++;},
    document:{addEventListener(name,fn){event=fn;},removeEventListener(name,fn){assert.equal(fn,event);cleaned++;}}
  });
  useGameDeadline(true,10,n=>ticks.push(n),()=>{expired++;result=1;});layout();const cleanup=effect();
  now=1500;interval();assert.equal(ticks.at(-1),9);
  useGameDeadline(true,10,n=>ticks.push(n),()=>{expired++;result=90;});layout();
  now=12000;event();interval();assert.equal(expired,1);assert.equal(result,90);assert.equal(ticks.at(-1),0);
  cleanup();assert.equal(cleaned,2);
});
