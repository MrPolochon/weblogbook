const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}
const { createMilitaryFlightSchema, updateMilitaryFlightSchema } = load('src/lib/armee/validation.ts');
const { readAllMilitaryRows } = load('src/lib/armee/read-all.ts');
const { uniqueUtcDatesDesc } = load('src/lib/armee/streaks.ts');
const { canEditVolMilitaire, canDeleteVolMilitaire } = load('src/lib/armee/permissions.ts', { '@/lib/supabase/admin': {} });
const uuid = '11111111-1111-4111-8111-111111111111';
const valid = { armee_avion_id: uuid, aeroport_depart: 'imlr', aeroport_arrivee: 'irfd', duree_minutes: 35, depart_utc: '2026-10-08T10:30:00Z', commandant_bord: 'Pilote', escadrille_ou_escadron: 'escadrille' };
test('both forms reject unsafe durations and invalid crew; protected client fields are ignored', () => {
  for (const schema of [createMilitaryFlightSchema, updateMilitaryFlightSchema]) {
    for (const duration of [0, 1441, 3.5, Infinity, NaN, '35minutes']) assert.equal(schema.safeParse({ ...valid, duree_minutes: duration }).success, false);
    assert.equal(schema.safeParse({ ...valid, equipage_ids: ['bad-id'] }).success, false);
    assert.equal(schema.safeParse({ ...valid, commandant_bord: ' ' }).success, false);
    assert.equal(schema.safeParse({ ...valid, depart_utc: 'wrong' }).success, false);
    const value = schema.parse({ ...valid, mission_reward_final: 999999 });
    assert.equal(value.aeroport_depart, 'IMLR'); assert.equal(value.mission_reward_final, undefined);
  }
});
test('reading a long military record loads every page and stops on failure', async () => {
  const rows = Array.from({ length: 1205 }, (_, id) => ({ id })); let pages = 0;
  const loaded = await readAllMilitaryRows((from, to) => { pages++; return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); });
  assert.deepEqual(loaded, rows); assert.equal(pages, 3);
  await assert.rejects(readAllMilitaryRows(() => Promise.resolve({ data: null, error: { message: 'failed' } })), /charger/);
});
test('streak dates use UTC even on a host in Honolulu', () => {
  const oldTZ = process.env.TZ; process.env.TZ = 'Pacific/Honolulu';
  try { assert.deepEqual(uniqueUtcDatesDesc(['2026-10-08T00:30:00Z', '2026-10-07T23:30:00Z', '2026-10-08T10:00:00Z']), ['2026-10-08', '2026-10-07']); }
  finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
});
test('paid missions cannot be edited or deleted even by an administrator', () => {
  const vol = { pilote_id: uuid, copilote_id: null, chef_escadron_id: null, statut: 'validé', mission_reward_final: 15000 };
  assert.equal(canEditVolMilitaire(vol, uuid, true), false); assert.equal(canDeleteVolMilitaire(vol, uuid, true), false);
});
