const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
function mount(options = {}) {
  const slots = [], effects = [], requests = []; let cursor = 0, dirty = true, tree, failure = false;
  const research = { id: 'NUM-02', title: 'Connexion à bord', domain: 'Numérique', description: 'Déployer le Wi-Fi', panel: 'wifi', unlock_key: 'wifi', cost: 2000, delay_seconds: 86400, prerequisites: [], status: 'available', ready_at: null };
  let data = { can_manage: true, research: [research], hand: [{ id: 'offered-card', title: 'Équiper les bureaux', description: 'Déployer un projet', cost: 1000, delay_seconds: 172800, research_id: null, expires_month: '2026-10-01' }], commitments: [], monthly: { used: 0, remaining: 5, next_refill_at: '2026-11-01T00:00:00Z' }, global_event: null, services: { unlocks: [], settings: { wifi_enabled: false, wifi_price: 0, seat_ratio: 1, ife_level: 0 }, dossiers: [], codeshares: [] }, ...options.data };
  const memo = (fn, deps) => { const i = cursor++; const old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) slots[i] = { deps, value: fn() }; return slots[i].value; };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; const old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const fetchJson = async (url, init) => {
    requests.push({ url, init });
    if (init?.method === 'POST') {
      if (failure) { failure = false; throw Error('Réseau indisponible'); }
      const body = JSON.parse(init.body);
      if (body.action === 'card_commit') data = { ...data, hand: [], commitments: [{ id: 'commitment', title: 'Équiper les bureaux', cost: 1000, active_at: '2026-11-01T00:00:00Z', status: 'installing', revenue_percent: -4.25 }], monthly: { ...data.monthly, used: 1, remaining: 4 } };
      return { ok: true };
    }
    return data;
  };
  const source = ts.transpileModule(fs.readFileSync('src/components/company/CompanyDevelopment.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'exports', 'window', 'crypto', source)(name => name === 'react' ? react : name === '@/lib/fetch-json' ? { fetchJson } : name.endsWith('.module.css') ? { default: new Proxy({}, { get: (_, key) => String(key) }) } : require(name), mod.exports, { setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {} }, { randomUUID: () => 'unique-operation-key' });
  const props = { compagnieId: 'company', canManage: true, section: 'rse', onBalanceChange() {}, ...options.props };
  function render() { let loops = 0; do { dirty = false; cursor = 0; tree = mod.exports.default(props); for (const effect of effects.splice(0)) effect(); assert(++loops < 20); } while (dirty); return tree; }
  const c = { requests, props, render, all: () => walk(tree), get text() { return text(tree); }, find: fn => walk(tree).find(fn), button(label) { return this.find(node => node.type === 'button' && text(node) === label); }, async flush() { await new Promise(resolve => setImmediate(resolve)); render(); }, click(label) { const button = this.button(label); assert(button, label); button.props.onClick(); render(); }, failNext() { failure = true; }, cleanup() { for (const slot of slots) slot?.cleanup?.(); } };
  render(); return c;
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

test('an employee cannot access management controls even when a selected URL targets RSE', async () => {
  for (const [canManage, serverManage] of [[false, false], [true, false]]) {
    const c = mount({ props: { canManage }, data: { can_manage: serverManage } }); try { await c.flush(); assert(!c.button('Examiner l’engagement')); assert(!c.button('Confirmer et financer')); } finally { c.cleanup(); }
  }
});

test('changing research filters and sections retains an unsaved service configuration', async () => {
  const c = mount({ props: { section: 'services' }, data: { services: { unlocks: ['wifi', 'wifi_metered'], settings: { wifi_enabled: true, wifi_price: 2, seat_ratio: 1, ife_level: 0 }, dossiers: [], codeshares: [] } } });
  try {
    await c.flush(); const input = c.find(node => node.type === 'input' && node.props.step === '0.01'); input.props.onChange({ target: { value: '0.75' } }); c.render();
    c.props.section = 'recherche'; c.render(); assert.match(c.text, /Connexion à bord/); c.props.section = 'services'; c.render(); assert.equal(c.find(node => node.type === 'input' && node.props.step === '0.01').props.value, 0.75);
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
