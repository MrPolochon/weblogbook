const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
 const m = { exports: {} };
 new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => deps[name] ?? require(name), m, m.exports);
 return m.exports;
}
const workspace = load('src/lib/instruction-workspace.ts');
const learner = { isAdmin: false, isManager: false, canViewExams: false };
test('unauthorized and unknown instruction tabs fall back to the learner workspace', () => {
 for (const tab of ['admin', 'formation', 'examens', 'unknown']) assert.equal(workspace.resolveInstructionTab(tab, learner), 'espace');
});
test('active sessions retain their required tab, while administrators may open admin', () => {
 assert.equal(workspace.resolveInstructionTab('formation', learner, 'exam'), 'examens');
 assert.equal(workspace.resolveInstructionTab('admin', learner, 'pilot_training'), 'espace');
 assert.equal(workspace.resolveInstructionTab('admin', { ...learner, isAdmin: true }, 'exam'), 'admin');
});
test('progress ignores obsolete modules and cannot exceed 100 percent', () => {
 const p = { licenceCode: 'ATC-INIT', modules: [{ code: 'A1' }, { code: 'A2' }] };
 assert.equal(workspace.instructionProgressPercent(p, new Set(['old', 'A1'])), 50);
 assert.equal(workspace.instructionProgressPercent(p, new Set(['old', 'A1', 'A2'])), 100);
 assert.equal(workspace.instructionProgressPercent(null, new Set(['A1'])), 0);
});
function progressionRoute({ active = true, existing = null, readError = null } = {}) {
 let writes = [], notifications = [];
 const admin = { from(table) {
  const q = { select() { return q; }, eq() { return q; },
   async single() { return { data: table === 'profiles' ? { role: 'admin', id: 'student', formation_instruction_active: active, formation_instruction_licence: 'ATC-INIT' } : null }; },
   async maybeSingle() { return { data: table === 'instruction_progression_items' ? existing : { identifiant: 'teacher' }, error: readError }; },
   async upsert(payload) { writes.push(payload); return { error: null }; } };
  return q;
 } };
 const route = load('src/app/api/instruction/progression/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'teacher' } } }) } }) },
  '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/instruction-programs': { INSTRUCTION_PROGRAMS: [{ licenceCode: 'ATC-INIT', modules: [{ code: 'A1', title: 'Module' }] }] },
  '@/lib/instruction-permissions': { getInstructionCapabilities: async () => ({}), canAccessInstructionManagerTools: () => true, canInstructorManageEleveForFormation: () => true },
  '@/lib/notifications': { notifyUser: async (...args) => { notifications.push(args); } },
 });
 return { patch: body => route.PATCH({ json: async () => ({ eleve_id: 'student', licence_code: 'ATC-INIT', module_code: 'A1', ...body }) }), writes, notifications };
}
test('progression rejects string booleans, invalid notes and empty patches', async () => {
 for (const body of [{ completed: 'false' }, { note: {} }, {}]) {
  const r = progressionRoute(); assert.equal((await r.patch(body)).status, 400); assert.equal(r.writes.length, 0);
 }
});
test('closed courses and failed reads cannot be overwritten', async () => {
 const closed = progressionRoute({ active: false }); assert.equal((await closed.patch({ completed: true })).status, 409); assert.equal(closed.writes.length, 0);
 const offline = progressionRoute({ readError: { message: 'offline' } }); assert.equal((await offline.patch({ note: 'new' })).status, 503); assert.equal(offline.writes.length, 0);
});
test('saving a validated module preserves its date and sends no duplicate notification', async () => {
 const r = progressionRoute({ existing: { completed: true, completed_at: '2026-09-01', note: 'old' } });
 assert.equal((await r.patch({ completed: true, note: 'new' })).status, 200);
 assert.equal(r.writes[0].completed_at, '2026-09-01'); assert.equal(r.notifications.length, 0);
});
test('a note-only patch preserves validation and first validation notifies the learner', async () => {
 const r = progressionRoute({ existing: { completed: true, completed_at: '2026-09-01', note: 'old' } });
 await r.patch({ note: 'new' }); assert.equal(r.writes[0].completed, true); assert.equal(r.notifications.length, 0);
 const first = progressionRoute(); await first.patch({ completed: true, note: 'first' }); assert.equal(first.notifications.length, 1);
});
