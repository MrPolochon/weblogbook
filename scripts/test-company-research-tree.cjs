const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const filename = 'src/lib/company-research-tree.ts';
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(require, mod, mod.exports);
const { buildResearchTree, researchAncestors, researchCountdown } = mod.exports;
const research = (id, prerequisites = [], domain = 'Numérique') => ({ id, title: id, domain, description: `Objectif ${id}`, panel: null, unlock_key: null, cost: 1000, delay_seconds: 3600, prerequisites, status: prerequisites.length ? 'available' : 'completed', ready_at: null });

test('research layout follows every visible prerequisite and gives each project its own position', () => {
  const items = [research('ROOT'), research('BRANCH-A', ['ROOT']), research('BRANCH-B', ['ROOT']), research('MERGE', ['BRANCH-A', 'BRANCH-B']), research('LEAF', ['MERGE'])];
  const layout = buildResearchTree(items, 'Numérique');
  const nodes = new Map(layout.nodes.map(node => [node.id, node]));
  assert.deepEqual([...nodes.keys()].sort(), items.map(item => item.id).sort());
  assert.deepEqual(layout.edges.map(edge => `${edge.from}>${edge.to}`).sort(), ['ROOT>BRANCH-A', 'ROOT>BRANCH-B', 'BRANCH-A>MERGE', 'BRANCH-B>MERGE', 'MERGE>LEAF'].sort());
  assert.equal(new Set(layout.nodes.map(node => `${node.x},${node.y}`)).size, items.length);
  for (const node of layout.nodes) {
    assert(Number.isFinite(node.x) && Number.isFinite(node.y));
    assert(node.x >= 0 && node.x < layout.width);
    assert(node.y >= 0 && node.y < layout.height);
    assert.equal(node.item.id, node.id);
  }
  for (const edge of layout.edges) {
    assert(nodes.get(edge.to).depth > nodes.get(edge.from).depth);
    assert(nodes.get(edge.to).x > nodes.get(edge.from).x);
  }
});

test('the layout never creates unrevealed projects or connections from prerequisite identifiers', () => {
  const revealed = [research('VISIBLE', ['NOT-REVEALED']), research('NEXT', ['VISIBLE']), research('OTHER-DOMAIN', [], 'Réseau')];
  const layout = buildResearchTree(revealed, 'Numérique');
  assert.deepEqual(layout.nodes.map(node => node.id).sort(), ['NEXT', 'VISIBLE']);
  assert.deepEqual(layout.edges, [{ from: 'VISIBLE', to: 'NEXT' }]);
  assert.deepEqual(buildResearchTree([], 'Numérique').nodes, []);
  assert.deepEqual(buildResearchTree([], 'Numérique').edges, []);
});

test('selected ancestry includes both prerequisite branches without unrelated projects', () => {
  const items = [research('ROOT'), research('BRANCH-A', ['ROOT']), research('BRANCH-B', ['ROOT']), research('MERGE', ['BRANCH-A', 'BRANCH-B']), research('UNRELATED')];
  assert.deepEqual([...researchAncestors(items, 'MERGE')].sort(), ['BRANCH-A', 'BRANCH-B', 'MERGE', 'ROOT']);
  assert.deepEqual([...researchAncestors(items, 'ROOT')], ['ROOT']);
  assert.deepEqual([...researchAncestors(items, 'UNKNOWN')], []);
});

test('countdown formats days and seconds without negative time or invalid dates', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  assert.equal(researchCountdown(new Date(now + 90_061_000).toISOString(), now), '1 j 01 h 01 min 01 s');
  assert.equal(researchCountdown(new Date(now + 100).toISOString(), now), '00 h 00 min 01 s');
  assert.equal(researchCountdown(new Date(now - 1000).toISOString(), now), 'Vérification de la fin…');
  assert.equal(researchCountdown(null, now), 'Échéance indisponible');
  assert.equal(researchCountdown('invalid', now), 'Échéance indisponible');
});
