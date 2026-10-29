const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
const userId = '00000000-0000-4000-8000-000000000001';

function createPilotFixture(options = {}) {
  const queries = [];
  const error = key => options.errors?.includes(key) ? { message: 'Fixture unavailable' } : null;
  function result(state) {
    const failed = error(state.table);
    if (failed) return { data: null, error: failed, count: null };
    if (state.table === 'profiles') return { data: { identifiant: 'Pilote démonstration', heures_initiales_minutes: 120, blocked_until: null }, error: null };
    if (state.table === 'felitz_comptes') return { data: options.noAccount ? null : { solde: 18750 }, error: null };
    if (state.table === 'plans_vol' && state.head) return { data: null, error: null, count: 1 };
    if (state.table === 'plans_vol') return { data: options.noPlans ? [] : [
      { id: 'plan-demo-1', numero_vol: 'MX204', aeroport_depart: 'IRFD', aeroport_arrivee: 'ITKO', statut: 'en_cours', created_at: '2026-10-28T17:15:00Z', temps_prev_min: 25, pilote_id: userId, deroutement_at: null },
      { id: 'plan-demo-2', numero_vol: 'MX618', aeroport_depart: 'IPPH', aeroport_arrivee: 'IZOL', statut: 'en_attente_copilote', created_at: '2026-10-28T17:00:00Z', temps_prev_min: 35, pilote_id: '00000000-0000-4000-8000-000000000002', deroutement_at: null },
    ], count: options.noPlans ? 0 : 2, error: null };
    throw new Error('Unexpected fixture query: ' + state.table);
  }
  function from(table) {
    const state = { table, filters: [], head: false, limit: null, orders: [] };
    queries.push(state);
    const query = {
      select(columns, config) { state.columns = columns; state.head = Boolean(config?.head); return this; },
      eq(field, value) { state.filters.push({ op: 'eq', field, value }); return this; },
      or(value) { state.filters.push({ op: 'or', value }); return this; },
      in(field, value) { state.filters.push({ op: 'in', field, value }); return this; },
      is(field, value) { state.filters.push({ op: 'is', field, value }); return this; },
      not(field, operator, value) { state.filters.push({ op: 'not', field, operator, value }); return this; },
      order(field, value) { state.orders.push({ field, value }); return this; },
      limit(value) { state.limit = value; return this; },
      maybeSingle() { return Promise.resolve(result(state)); },
      then(resolve, reject) { return Promise.resolve(result(state)).then(resolve, reject); },
    };
    return query;
  }
  const client = { from, auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: userId } } }) }, rpc: async (name, args) => {
    queries.push({ table: name, args });
    if (name === 'get_unrecorded_closed_plans') return { data: error(name) ? null : options.noPlans ? [] : [{ id: 'closed-demo', numero_vol: 'MX101', aeroport_depart: 'IRFD', aeroport_arrivee: 'ITKO', type_vol: 'IFR', temps_prev_min: 20, accepted_at: '2026-10-28T16:00:00Z', cloture_at: '2026-10-28T16:20:00Z', available_count: 1 }], error: error(name) };
    return { data: error(name) ? null : { total: 38, validated: 36, pending: 2, refused: 0, minutes: 2934 }, error: error(name) };
  } };
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    function req(name) {
      if (name === 'next/link') return { __esModule: true, default: ({ children, prefetch, ...props }) => React.createElement('a', props, children) };
      if (name === 'next/navigation') return { redirect: url => { throw new Error('REDIRECT:' + url); }, usePathname: () => '/pilote' };
      if (name === '@/lib/supabase/server') return { createClient: async () => client };
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => client };
      if (name === '@/components/MajorEventBanner') return { __esModule: true, default: () => null };
      if (name.startsWith('@/')) {
        const base = path.join(root, 'src', name.slice(2));
        const target = [base + '.tsx', base + '.ts'].find(p => fs.existsSync(p));
        if (!target) throw new Error('Unresolved fixture dependency: ' + name);
        return load(path.relative(root, target));
      }
      return require(name);
    }
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(req, module, module.exports);
    cache.set(file, module.exports); return module.exports;
  }
  async function render(withShell = false) {
    const Page = load('src/app/(app)/pilote/page.tsx').default;
    const content = await Page();
    const Workspace = withShell ? load('src/components/pilot/PilotWorkspace.tsx').default : React.Fragment;
    return renderToStaticMarkup(React.createElement(Workspace, null, content));
  }
  return { render, queries, load, userId };
}
module.exports = { createPilotFixture };
