const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const walk = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
function mount(responses) {
  const slots = [], effects = [], requests = [], alerts = []; let cursor = 0, dirty = true, tree;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++; if (!(i in slots)) { slots[i] = deps; effects.push(fn); } },
    useTransition: () => [false, fn => fn()],
  };
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/app/(app)/logbook/plans-vol/PlanVolCloturerButton.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const dependencies = { react, 'react-dom': { createPortal: node => node }, 'next/navigation': { useRouter: () => ({ refresh() {} }) }, 'next/link': { default: () => null } };
  new Function('require', 'exports', 'fetch', 'alert', 'document', code)(name => dependencies[name] ?? require(name), mod.exports, async (url, init) => { requests.push({ url, init }); const response = responses.shift(); if (response instanceof Error) throw response; return Response.json(response.body, { status: response.status ?? 200 }); }, message => alerts.push(message), { body: {} });
  const c = { requests, alerts, render() { let loops = 0; do { dirty = false; cursor = 0; tree = mod.exports.default({ planId: 'plan', statut: 'accepte' }); for (const effect of effects.splice(0)) effect(); assert(++loops < 20); } while (dirty); }, async click() { const button = walk(tree).find(node => node.type === 'button' && text(node) === 'Clôturer le vol'); assert(button); await button.props.onClick(); this.render(); }, get text() { return text(tree); } }; c.render(); return c;
}

test('a failed closure releases the actual pilot button and a retry displays the new bank settlement', async () => {
  const c = mount([{ status: 409, body: { error: 'Durée de vol anormalement courte' } }, { body: { statut: 'cloture', paiement: { revenus: { economieVersion: 2, salaire: 250 } } } }]);
  await c.click(); assert.equal(c.requests.length, 1); assert.deepEqual(c.alerts, ['Durée de vol anormalement courte']);
  await c.click(); assert.equal(c.requests.length, 2); assert.match(c.text, /Règlement crédité sur Felitz Bank/); assert.match(c.text, /Salaire de l’équipage versé : 250 F\$/); assert.match(c.text, /Enregistrer dans le logbook/);
});

test('a network failure also permits retry and legacy closure never claims a direct bank credit', async () => {
  const c = mount([Error('Connexion perdue'), { body: { statut: 'cloture', paiement: { revenus: { brut: 1000, salaire: 200 } } } }]);
  await c.click(); await c.click(); assert.equal(c.requests.length, 2); assert.deepEqual(c.alerts, ['Connexion perdue']); assert.doesNotMatch(c.text, /Règlement crédité sur Felitz Bank/);
});
