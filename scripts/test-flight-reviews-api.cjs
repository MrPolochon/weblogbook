const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const load = (filename, deps = {}) => {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', source)(name => { assert(name in deps, name); return deps[name]; }, mod, mod.exports);
  return mod.exports;
};
const config = load('src/lib/flight-reviews-feed.ts');
const id = value => `${String(value).padStart(8, '0')}-5555-4555-8555-555555555555`;
const created_at = '2026-10-30T04:30:00.000Z';
const row = value => ({ id: id(value), author_label: `Voyageur ${value}`, body: `Publication ${value}`, sentiment: 'positif', rating: 5, simulation: true, created_at });
function fixture(results = [], options = {}) {
  const queries = [];
  const route = load('src/app/api/avis-web/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers ?? {} }) } },
    '@/lib/flight-reviews-feed': config,
    '@/lib/rate-limit': { applyRateLimit: () => ({ allowed: !options.limited }) },
    '@/lib/supabase/server': { createClient: async () => ({ from(table) {
      const calls = []; queries.push({ table, calls });
      const query = { then(resolve) { return Promise.resolve(results.shift() ?? { data: [] }).then(resolve); } };
      for (const method of ['select', 'order', 'limit', 'or', 'eq', 'ilike']) query[method] = (...args) => { calls.push({ method, args }); return query; };
      return query;
    } }) },
  });
  return { route, queries, get: query => route.GET(new Request(`https://example.test/api/avis-web${query ? `?${query}` : ''}`)) };
}

test('a thirty-review batch with identical timestamps spans stable public pages without exposing source plans', async () => {
  const batch = Array.from({ length: 30 }, (_, index) => row(30 - index));
  const f = fixture([{ data: batch.slice(0,26) }, { data: batch.slice(25) }]);
  const first = await f.get();
  assert.equal(first.status,200); assert.deepEqual(first.body.reviews,batch.slice(0,25));
  assert.equal(first.body.feed_limit,500); assert.equal(first.headers['Cache-Control'],'no-store');
  assert.equal(first.body.next,`${created_at}|${batch[24].id}`);
  const next = await f.get(new URLSearchParams({ before: first.body.next }).toString());
  assert.deepEqual(next.body.reviews,batch.slice(25)); assert.equal(next.body.next,null);
  assert.equal(new Set([...first.body.reviews,...next.body.reviews].map(review=>review.id)).size,30);
  for (const { table, calls } of f.queries) {
    assert.equal(table,'flight_reviews');
    assert.equal(calls.find(call=>call.method==='select').args[0],'id,author_label,body,sentiment,rating,simulation,created_at');
    assert.deepEqual(calls.filter(call=>call.method==='order').map(call=>call.args),[['created_at',{ascending:false}],['id',{ascending:false}]]);
    assert.deepEqual(calls.find(call=>call.method==='limit').args,[26]);
  }
  assert.equal(f.queries[1].calls.find(call=>call.method==='or').args[0],`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${batch[24].id})`);
});

test('filters remain public, escaped and compatible with an old cursor whose rows were pruned',async()=>{
  const f=fixture([{data:[]}]);
  const response=await f.get(new URLSearchParams({before:`${created_at}|${id(10)}`,sentiment:'negatif',q:'A_%'}).toString());
  assert.equal(response.status,200);assert.deepEqual(response.body.reviews,[]);assert.equal(response.body.next,null);
  assert.deepEqual(f.queries[0].calls.find(call=>call.method==='eq').args,['sentiment','negatif']);
  assert.deepEqual(f.queries[0].calls.find(call=>call.method==='ilike').args,['body','%A\\_\\%%']);
});

test('invalid cursors and throttled requests stop before reading the public table',async()=>{
  for(const [options,query,status] of [[{},'before=bad',400],[{limited:true},'',429]]) {
    const f=fixture([],options);assert.equal((await f.get(query)).status,status);assert.equal(f.queries.length,0);
  }
});
