const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/lib/aeroports-ptfs.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(require, mod, mod.exports);
const { sanitizePrix, calculerCoefficientChargementCargo, calculerCoefficientRemplissage } = mod.exports;

test('tariff sanitization preserves decimal prices and rejects malformed or non-finite values', () => {
  for (const value of [0, 0.75, 1.20, 1.80, 100.25]) assert.equal(sanitizePrix(value), value);
  assert.equal(sanitizePrix('1,25'), 1.25);assert.equal(sanitizePrix('1.25'), 1.25);assert.equal(sanitizePrix('1 234,50'), 1234.5);
  for (const value of [-1, NaN, Infinity, '', '-50', '+100000', '1e10', '1.2.3', '1,2,3']) assert.equal(sanitizePrix(value), 0);
  assert.equal(sanitizePrix(2_000_000), 1_000_000);
});

test('the real demand functions respond to cents instead of treating an entire price interval identically', () => {
  const cargoContext = { lastArrivalAtArrivee: new Date(), ratioCargoDispo: 1, capaciteCargoKg: 1000 };
  const lowCargo = calculerCoefficientChargementCargo('IRFD', 'ITKO', 2.10, cargoContext);
  const highCargo = calculerCoefficientChargementCargo('IRFD', 'ITKO', 2.90, cargoContext);
  assert(lowCargo > highCargo, `${lowCargo} should exceed ${highCargo}`);
  const paxContext = { lastArrivalAtArrivee: new Date(), ratioPaxDispo: 1, capacitePax: 100 };
  assert(calculerCoefficientRemplissage('IRFD', 'ITKO', 400.10, paxContext) > calculerCoefficientRemplissage('IRFD', 'ITKO', 400.90, paxContext));
  assert.equal(calculerCoefficientChargementCargo('IRFD', 'ITKO', 5, cargoContext), 0);
  assert.equal(calculerCoefficientRemplissage('IRFD', 'ITKO', 500, paxContext), 0);
});
