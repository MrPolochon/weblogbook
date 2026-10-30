const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
function mount(options = {}) {
  const instances = new Map(), components = new Set(), modules = new Map(), effects = [], requests = [], intervals = new Map();
  let current, seen, dirty = true, tree, failure = false, refreshFailure = false, balanceChanges = 0, intervalId = 0, now = options.now ?? Date.now();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const browser = { setInterval(fn, delay) { const id = ++intervalId; intervals.set(id, { fn, delay, next: now + delay }); return id; }, clearInterval(id) { intervals.delete(id); }, setTimeout: () => 1, clearTimeout() {} };
  const research = { id: 'NUM-02', title: 'Connexion à bord', domain: 'Numérique', description: 'Déployer le Wi-Fi', panel: 'wifi', unlock_key: 'wifi', cost: 2000, delay_seconds: 86400, prerequisites: [], status: 'available', ready_at: null };
  let data = { can_manage: true, research: [research], hand: [{ id: 'offered-card', title: 'Équiper les bureaux', description: 'Déployer un projet', cost: 1000, delay_seconds: 172800, research_id: null, expires_month: '2026-10-01' }], commitments: [], monthly: { used: 0, remaining: 5, next_refill_at: '2026-11-01T00:00:00Z' }, global_event: null, services: { unlocks: [], settings: { wifi_enabled: false, wifi_price: 0, seat_ratio: 1, ife_level: 0 }, dossiers: [], codeshares: [] }, ...options.data };
  const changed = (old, deps) => !old || !deps || deps.some((value, index) => !Object.is(value, old.deps?.[index]));
  const memo = (fn, deps) => { const { slots } = current; const i = current.cursor++; const old = slots[i]; if (changed(old, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; };
  const react = {
    useState(initial) { const { slots } = current; const i = current.cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const { slots } = current; const i = current.cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useMemo: memo,
    useId() { return memo(() => `test-${instances.size}-${current.cursor}`, []); },
    useEffect(fn, deps) { const { slots } = current; const i = current.cursor++; const old = slots[i]; if (changed(old, deps)) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsxRuntime = require('react/jsx-runtime');
  const jsx = factory => (type, ...args) => { if (typeof type === 'function') components.add(type); return factory(type, ...args); };
  const runtime = { ...jsxRuntime, jsx: jsx(jsxRuntime.jsx), jsxs: jsx(jsxRuntime.jsxs) };
  const fetchJson = async (url, init) => {
    requests.push({ url, init });
    if (init?.method === 'POST') {
      if (failure) { failure = false; throw Error('Réseau indisponible'); }
      const body = JSON.parse(init.body);
      if (body.action === 'card_commit') data = { ...data, hand: [], commitments: [{ id: 'commitment', title: 'Équiper les bureaux', cost: 1000, active_at: '2026-11-01T00:00:00Z', status: 'installing', revenue_percent: -4.25 }], monthly: { ...data.monthly, used: 1, remaining: 4 } };
      if (body.action === 'research_start') data = { ...data, research: data.research.map(item => item.id === body.research_id ? { ...item, status: 'running', ready_at: new ClockDate(now + item.delay_seconds * 1000).toISOString() } : item) };
      return { ok: true };
    }
    if (refreshFailure) { refreshFailure = false; throw Error('Relecture indisponible'); }
    data = { ...data, research: data.research.map(item => item.status === 'running' && item.ready_at && Date.parse(item.ready_at) <= now ? { ...item, status: 'completed' } : item) };
    return data;
  };
  function loadModule(filename) {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = { exports: {} }; modules.set(filename, mod);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return runtime;
      if (name === '@/lib/fetch-json') return { fetchJson };
      if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.startsWith('./') || name.startsWith('../') || name.startsWith('@/')) {
        const target = name.startsWith('@/') ? path.resolve('src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        const resolved = [target, `${target}.ts`, `${target}.tsx`].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        assert(resolved, `Cannot resolve ${name} from ${filename}`); return loadModule(resolved);
      }
      return require(name);
    };
    new Function('require', 'module', 'exports', 'window', 'crypto', 'Date', source)(localRequire, mod, mod.exports, browser, { randomUUID: () => 'unique-operation-key' }, ClockDate);
    if (filename.endsWith('.tsx')) for (const value of Object.values(mod.exports)) if (typeof value === 'function') components.add(value);
    return mod.exports;
  }
  const Component = loadModule('src/components/company/CompanyDevelopment.tsx').default;
  const props = { compagnieId: 'company', canManage: true, section: 'rse', onBalanceChange() { balanceChanges++; }, ...options.props };
  function expand(node, location) {
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${location}.${child?.key ?? index}`));
    if (!node || typeof node !== 'object') return node;
    if (components.has(node.type)) return invoke(node.type, node.props, `${location}:${node.type.name}`);
    return { ...node, props: { ...node.props, children: expand(node.props?.children, `${location}.children`) } };
  }
  function invoke(component, componentProps, location) {
    seen.add(location);
    if (!instances.has(location)) instances.set(location, { slots: [], cursor: 0 });
    const previous = current; current = instances.get(location); current.cursor = 0;
    const output = component(componentProps); current = previous;
    return expand(output, location);
  }
  function render() {
    let loops = 0;
    do {
      dirty = false; seen = new Set(); tree = invoke(Component, props, 'root');
      for (const [location, instance] of instances) if (!seen.has(location)) { for (const slot of instance.slots) slot?.cleanup?.(); instances.delete(location); }
      for (const effect of effects.splice(0)) effect();
      assert(++loops < 20);
    } while (dirty);
    return tree;
  }
  const c = { requests, props, render, all: () => walk(tree), get text() { return text(tree); }, get balanceChanges() { return balanceChanges; }, find: fn => walk(tree).find(fn), button(label) { return this.find(node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label)); }, async flush() { await new Promise(resolve => setImmediate(resolve)); render(); }, click(label) { const button = this.button(label); assert(button, label); assert(!button.props.disabled, `Disabled: ${label}`); button.props.onClick(); render(); }, advance(milliseconds) { now += milliseconds; for (const timer of [...intervals.values()]) if (timer.next <= now) { timer.next += (Math.floor((now - timer.next) / timer.delay) + 1) * timer.delay; timer.fn(); } render(); }, failNext() { failure = true; }, failRefresh() { refreshFailure = true; }, cleanup() { for (const instance of instances.values()) for (const slot of instance.slots) slot?.cleanup?.(); } };
  render(); return c;
}
function examineResearch(c, title = 'Connexion à bord', domain = 'Numérique') {
  const label = `Examiner la recherche : ${title}`;
  if (!c.button(label)) c.click(`Explorer le domaine : ${domain}`);
  c.click(label);
}

test('RSE commitment requires confirmation, reveals the server result after payment and waits for activation', async () => {
  const c = mount(); try {
    await c.flush(); assert.doesNotMatch(c.text, /4,25/); assert.match(c.text, /inconnu avant engagement/);
    c.click('Examiner l’engagement'); assert.equal(c.requests.filter(r => r.init?.method === 'POST').length, 0);
    assert.match(c.text, /Débit immédiat/); assert.match(c.text, /2 jours/);
    c.click('Confirmer et financer'); await c.flush();
    const mutation = c.requests.find(r => r.init?.method === 'POST'); assert.deepEqual(JSON.parse(mutation.init.body), { action: 'card_commit', card_id: 'offered-card', idempotency_key: 'unique-operation-key' });
    assert.match(c.text, /-4,25/); assert.match(c.text, /En déploiement/); assert.match(c.text, /4 actions encore possibles/); assert.doesNotMatch(c.text, /Actif · permanent/);
  } finally { c.cleanup(); }
});

test('a retry retains the same idempotency key and errors do not invent a successful project', async () => {
  const c = mount(); try {
    await c.flush(); c.click('Examiner l’engagement'); c.failNext(); c.click('Confirmer et financer'); await c.flush();
    assert.match(c.text, /Réseau indisponible/); assert.doesNotMatch(c.text, /-4,25/);
    c.click('Confirmer et financer'); await c.flush(); const mutations = c.requests.filter(r => r.init?.method === 'POST').map(r => JSON.parse(r.init.body));
    assert.equal(mutations.length, 2); assert.equal(mutations[0].idempotency_key, mutations[1].idempotency_key);
  } finally { c.cleanup(); }
});

test('research selection is read-only and financing requires confirmation with the same key on retry', async () => {
  const c = mount({ props: { section: 'recherche' } });
  try {
    await c.flush();
    examineResearch(c);
    assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 0);
    assert.match(c.text, /Déployer le Wi-Fi/);
    c.click('Financer la recherche');
    assert.match(c.text, /Financer cette recherche/);
    assert.match(c.text, /Débit immédiat/);
    assert.match(c.text, /1 jour/);
    assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 0);
    c.failNext(); c.click('Confirmer et financer'); await c.flush();
    assert.match(c.text, /Réseau indisponible/);
    assert.equal(c.balanceChanges, 0);
    assert.doesNotMatch(c.text, /Recherche financée/);
    c.click('Confirmer et financer'); await c.flush();
    const mutations = c.requests.filter(request => request.init?.method === 'POST').map(request => JSON.parse(request.init.body));
    assert.deepEqual(mutations, Array(2).fill({ action: 'research_start', research_id: 'NUM-02', idempotency_key: 'unique-operation-key' }));
    assert.equal(c.balanceChanges, 1);
    assert.match(c.text, /Recherche financée/);
    assert(!c.button('Confirmer et financer'));
    assert(!c.button('Financer la recherche'));
  } finally { c.cleanup(); }
});

test('a successful research payment clears confirmation even when the following refresh fails', async () => {
  const c = mount({ props: { section: 'recherche' } });
  try {
    await c.flush(); examineResearch(c); c.click('Financer la recherche');
    c.failRefresh(); c.click('Confirmer et financer'); await c.flush();
    assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 1);
    assert.equal(c.balanceChanges, 1);
    assert.match(c.text, /Opération enregistrée/);
    assert(!c.button('Confirmer et financer'));
    c.click('Actualiser'); await c.flush();
    assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 1);
    assert(!c.button('Financer la recherche'));
  } finally { c.cleanup(); }
});

test('running and completed research can be examined without offering another payment', async () => {
  for (const status of ['running', 'completed']) {
    const c = mount({ props: { section: 'recherche' }, data: { research: [{ id: 'NUM-02', title: 'Connexion à bord', domain: 'Numérique', description: 'Déployer le Wi-Fi', panel: 'wifi', unlock_key: 'wifi', cost: 2000, delay_seconds: 86400, prerequisites: [], status, ready_at: new Date(Date.now() + (status === 'running' ? 3_600_000 : -3_600_000)).toISOString() }] } });
    try {
      await c.flush(); examineResearch(c);
      assert(!c.button('Financer la recherche'));
      assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 0);
    } finally { c.cleanup(); }
  }
});

test('three running projects disable financing another revealed research', async () => {
  const base = { domain: 'Numérique', description: 'Déployer le Wi-Fi', panel: 'wifi', unlock_key: 'wifi', cost: 2000, delay_seconds: 86400, prerequisites: [] };
  const readyAt = new Date(Date.now() + 3_600_000).toISOString();
  const research = [
    ...[1, 2, 3].map(index => ({ ...base, id: `RUN-${index}`, title: `Recherche en cours ${index}`, status: 'running', ready_at: readyAt })),
    { ...base, id: 'NUM-02', title: 'Connexion à bord', status: 'available', ready_at: null },
  ];
  const c = mount({ props: { section: 'recherche' }, data: { research } });
  try {
    await c.flush(); examineResearch(c);
    assert.equal(c.button('Financer la recherche')?.props.disabled, true);
    assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 0);
  } finally { c.cleanup(); }
});

test('research countdowns tick every second and refresh completed projects without a payment', async () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const c = mount({ now, props: { section: 'recherche' }, data: { research: [{ id: 'NUM-02', title: 'Connexion à bord', domain: 'Numérique', description: 'Déployer le Wi-Fi', panel: 'wifi', unlock_key: 'wifi', cost: 2000, delay_seconds: 86400, prerequisites: [], status: 'running', ready_at: new Date(now + 5000).toISOString() }] } });
  try {
    await c.flush(); examineResearch(c);
    const timers = () => c.all().filter(node => node.props?.['data-research-countdown'] === 'NUM-02');
    assert.equal(timers().length, 2);
    for (const timer of timers()) { assert.equal(timer.props.role, 'timer'); assert.match(text(timer), /00 h 00 min 05 s/); }
    c.advance(1000);
    for (const timer of timers()) assert.match(text(timer), /00 h 00 min 04 s/);
    const requestsBeforeCompletion = c.requests.length;
    c.advance(4000); await c.flush();
    assert.equal(c.requests.length, requestsBeforeCompletion + 1);
    assert.equal(timers().length, 0);
    assert.match(c.text, /0 \/ 3 en cours/);
    assert.equal(c.requests.filter(request => request.init?.method === 'POST').length, 0);
    assert(!c.button('Financer la recherche'));
  } finally { c.cleanup(); }
});

test('an employee cannot access management controls even when a selected URL targets development', async () => {
  for (const section of ['rse', 'recherche']) for (const [canManage, serverManage] of [[false, false], [true, false]]) {
    const c = mount({ props: { canManage, section }, data: { can_manage: serverManage } }); try { await c.flush(); assert(!c.button('Examiner l’engagement')); assert(!c.button('Financer la recherche')); assert(!c.button('Confirmer et financer')); } finally { c.cleanup(); }
  }
});

test('changing research selection and sections retains an unsaved service configuration', async () => {
  const c = mount({ props: { section: 'services' }, data: { services: { unlocks: ['wifi', 'wifi_metered'], settings: { wifi_enabled: true, wifi_price: 2, seat_ratio: 1, ife_level: 0 }, dossiers: [], codeshares: [] } } });
  try {
    await c.flush(); const input = c.find(node => node.type === 'input' && node.props.step === '0.01'); input.props.onChange({ target: { value: '0.75' } }); c.render();
    c.props.section = 'recherche'; c.render(); examineResearch(c); assert.match(c.text, /Connexion à bord/); c.props.section = 'services'; c.render(); assert.equal(c.find(node => node.type === 'input' && node.props.step === '0.01').props.value, 0.75);
    const form = c.find(node => node.type === 'form'); form.props.onSubmit({ preventDefault() {} }); await c.flush(); const body = JSON.parse(c.requests.find(r => r.init?.method === 'POST').init.body); assert.equal(body.settings.wifi_price, 0.75); assert.equal(body.action, 'settings');
  } finally { c.cleanup(); }
});

test('Wi-Fi base research alone does not offer activation without a researched billing mode', async () => {
  const c = mount({ props: { section: 'services' }, data: { services: { unlocks: ['wifi'], settings: { wifi_enabled: false, wifi_price: 0, seat_ratio: 1, ife_level: 0 }, dossiers: [], codeshares: [] } } });
  try { await c.flush(); const checkbox = c.find(node => node.type === 'input' && node.props.type === 'checkbox'); assert.equal(checkbox.props.disabled, true); assert.match(c.text, /Recherchez une formule payante ou gratuite/); } finally { c.cleanup(); }
});
function companyLayout(leader) {
  const slots = []; let cursor = 0, tree; const urls = [];
  const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useEffect() {}, useCallback: fn => fn, useTransition: () => [false, fn => fn()] };
  const deps = { react, 'next/navigation': { useRouter: () => ({ push: url => urls.push(url), refresh() {} }) }, '@/lib/date-utils': {}, '@/lib/financial-input': {}, sonner: { toast: {} } };
  const mod = { exports: {} }; const source = ts.transpileModule(fs.readFileSync('src/app/(app)/ma-compagnie/MaCompagnieClient.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require', 'exports', 'window', source)(name => deps[name] ?? (name.endsWith('.module.css') ? { default: new Proxy({}, { get: (_, key) => String(key) }) } : name.startsWith('@/components/') || name.startsWith('./') || name === 'next/image' || name === 'next/link' ? { default: () => null } : require(name)), mod.exports, { location: { pathname: '/ma-compagnie', search: '?c=company' }, history: { replaceState: (_, __, url) => urls.push(url) } });
  const props = { compagniesDisponibles: [{ id: 'company', nom: 'Lufthansa', role: leader ? 'pdg' : 'employe' }], selectedCompagnieId: 'company', compagnie: { id: 'company', nom: 'Lufthansa', pourcentage_salaire: 20, prix_billet_pax: 123.45, prix_kg_cargo: 0, pdg_identifiant: 'président', alliance_id: null }, employes: [], isPdg: leader, isLeader: leader, soldeCompagnie: 10000 };
  const c = { render() { cursor = 0; tree = mod.exports.default(props); }, all: () => walk(tree), urls, nav(label) { const link = this.all().find(node => node.type === 'a' && text(node) === label); assert(link, label); link.props.onClick({ preventDefault() {} }); this.render(); } }; c.render(); return c;
}

test('company navigation shows one active panel and keeps unsaved settings across sections', () => {
  const c = companyLayout(true);
  assert.equal(c.all().filter(node => node.type === 'nav').length, 1);
  assert.equal(c.all().filter(node => node.type === 'a' && node.props.className === 'navLink').length, 9);
  c.nav('Paramètres'); let input = c.all().find(node => node.type === 'input' && node.props.value === '123.45'); assert(input);
  input.props.onChange({ target: { value: '456.78' } }); c.render(); c.nav('Équipe'); c.nav('Paramètres');
  assert(c.all().find(node => node.type === 'input' && node.props.value === '456.78'));
  assert.deepEqual(c.all().filter(node => node.type === 'section' && node.props['data-company-panel'] && !node.props.hidden).map(node => node.props.id), ['parametres']);
  assert.match(c.urls.at(-1), /#parametres$/);
});

test('company employee navigation has only overview, team and operations', () => {
  const c = companyLayout(false);
  assert.deepEqual(c.all().filter(node => node.type === 'a' && node.props.className === 'navLink').map(text), ['Vue d’ensemble', 'Équipe', 'Exploitation']);
  assert(!c.all().find(node => node.type === 'section' && ['parametres', 'finances', 'reseau'].includes(node.props.id)));
});
