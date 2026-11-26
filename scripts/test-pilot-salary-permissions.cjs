const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

async function request(actor, body, coCompany = 'company') {
  const writes = [];
  const db = { from(table) {
    const filters = {};
    let patch;
    const chain = {
      select() { return chain; }, eq(key, value) { filters[key] = value; return chain; },
      update(value) { patch = value; return chain; },
      single() { return chain; }, maybeSingle() { return chain; },
      then(resolve) {
        if (patch) { writes.push(patch); return Promise.resolve({ error: null }).then(resolve); }
        const data = table === 'profiles' ? { role: 'pilote' }
          : table === 'compagnies' ? { id: 'company', pdg_id: 'pdg' }
          : filters.id ? { id: 'employee', compagnie_id: 'company', pilote_id: 'pilot', role: 'employe' }
          : actor === 'co' && filters.compagnie_id === coCompany && filters.pilote_id === 'co' && filters.role === 'co_pdg' ? { id: 'membership' } : null;
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    }; return chain;
  }, auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null } }) } };
  const stubs = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/supabase/admin': { createAdminClient: () => db },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/compagnies/employes/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => stubs[name], console });
  return { result: await exports.PATCH({ json: async () => ({ id: 'employee', ...body }) }), writes };
}
test('PDG and same-company co-PDG may set or reset salary', async () => {
  for (const actor of ['pdg', 'co']) for (const rate of [null, 0, 35, 100]) {
    const { result, writes } = await request(actor, { pourcentage_salaire: rate });
    assert.equal(result.status, 200); assert.equal(writes[0].pourcentage_salaire, rate);
  }
});
test('ordinary employees, other-company co-PDG and unauthenticated users cannot change salaries', async () => {
  for (const [actor, company, status] of [['pilot','company',403],['co','other',403],[null,'company',401]]) {
    const r = await request(actor, { pourcentage_salaire: 80 }, company);
    assert.equal(r.result.status,status); assert.equal(r.writes.length,0);
  }
});
test('co-PDG salary rights never allow role changes or mixed requests', async () => {
  for (const body of [{role:'co_pdg'}, {role:'co_pdg',pourcentage_salaire:50}]) {
    const r = await request('co',body); assert.equal(r.result.status,403); assert.equal(r.writes.length,0);
  }
});
test('salary validation rejects invalid rates', async () => {
  for (const rate of [-1,101,1.5,'25',false]) {
    const r=await request('pdg',{pourcentage_salaire:rate}); assert.equal(r.result.status,400); assert.equal(r.writes.length,0);
  }
});
