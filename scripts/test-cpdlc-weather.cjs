const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(fetch) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cpdlc/weather.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, fetch, AbortSignal, Date });
  return exports;
}
const entry = { airport: 'IRFD', content: 'IRFD ATIS INFO A TIME 1334Z\nDEP RWY 25 ARR RWY 25\n218/04 9999 FEW048 08/00 Q1019\nCONTACT TOWER' };
test('weather derives observations without inventing date, forecast or operational ATIS', async () => {
  const api = load(async () => ({ ok: true, json: async () => [entry] }));
  const result = await api.requestWeather(['IRFD', 'IZOL'], 'METAR');
  assert.match(result, /IRFD 1334Z 21804KT 9999 FEW048 08\/00 Q1019/);
  assert.match(result, /DATE NOT PROVIDED/);
  assert.match(result, /IZOL: METAR NOT AVAILABLE/);
  assert.doesNotMatch(result, /CONTACT TOWER|DEP RWY/);
});
test('TAF is honestly unavailable without a network request', async () => {
  const api = load(() => { throw new Error('must not fetch'); });
  assert.match(await api.requestWeather(['IRFD'], 'TAF'), /TAF NOT AVAILABLE/);
});
test('weather provider failure and malformed data do not fabricate reports', async () => {
  assert.match(await load(async () => { throw new Error('timeout'); }).requestWeather(['IRFD'], 'METAR'), /SERVICE UNAVAILABLE/);
  assert.match(await load(async () => ({ ok: true, json: async () => ({}) })).requestWeather(['IRFD'], 'METAR'), /SERVICE UNAVAILABLE/);
  assert.equal(load().gameMetar({content:'IRFD ATIS INFO A'}, 'IRFD'), null);
});
test('weather validates request scope and shares short-lived cache', async () => {
  let calls = 0;
  const api = load(async () => { calls++; return {ok:true,json:async()=>[entry]}; });
  await api.requestWeather(['IRFD'], 'METAR'); await api.requestWeather(['IRFD'], 'METAR');
  assert.equal(calls, 1);
  await assert.rejects(api.requestWeather(['https://invalid'], 'METAR'), /INVALID/);
  await assert.rejects(api.requestWeather([], 'TAF'), /INVALID/);
});
