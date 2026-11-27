const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, stubs = {}) {
  const mod = { exports: {} };
  const requireFile = name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('@/')) {
      const base = `src/${name.slice(2)}`;
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`, stubs);
    }
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(file), name);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`, stubs);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText)(requireFile, mod, mod.exports);
  return mod.exports;
}

const theme = { useAtcTheme: () => ({ theme: 'dark', toggleTheme() {} }) };
let alarmActive = false;
let inbox = { messages: [] };
const common = {
  '@/contexts/AtcThemeContext': theme,
  '@/hooks/useCpdlc': { useCpdlc: () => ({ data: inbox, error: '', loading: false, busy: false, refresh() {}, act() {} }) },
  './useCpdlcAlarm': { useCpdlcAlarm: active => { alarmActive = active; return { blocked: false, enable: async () => {} }; } },
};
const panel = load('src/components/cpdlc/AtcCpdlcPanel.tsx', common);

test('clearance preview preserves FT/FL, squawk zeros and strips accents', () => {
  const value = { destination: 'irfd', departure: 'síd1a', altitude: 'FL050', squawk: '0042', frequency: '124.850', text: 'départ après contact' };
  assert.equal(panel.clearancePreview(value), 'CLD TO IRFD.\nSID1A DEPARTURE.\nMNTN FL050.\nDPRTR ON 124.850 SQUAWK 0042\nDEPART APRES CONTACT');
  assert.match(panel.clearancePreview({ ...value, altitude: '5000 FT' }), /MNTN 5000 FT\./);
});

test('manual vectors and direct departures never acquire a misleading SID suffix', () => {
  for (const departure of ['EXPECT VECTORS', 'DIRECT MAKEL']) {
    const text = panel.clearancePreview({ destination: 'IZOL', departure, altitude: 'FL070', squawk: '2000', frequency: '125.250' });
    assert.ok(text.includes(`${departure}.`));
    assert.doesNotMatch(text, /DEPARTURE/);
  }
});

test('closed ATC panel still signals unacknowledged incoming messages, not sent or ACKed rows', () => {
  inbox = { messages: [
    { id: '1', created_at: '2026-11-26T12:00:00Z', incoming: true, acknowledged: false, status: 'UNABLE' },
    { id: '2', created_at: '2026-11-26T11:00:00Z', incoming: true, acknowledged: true, status: 'STANDBY' },
    { id: '3', created_at: '2026-11-26T10:00:00Z', incoming: false, acknowledged: false, status: 'SENT' },
  ] };
  const html = renderToStaticMarkup(React.createElement(panel.default));
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /CPDLC, 1 unacknowledged messages/);
  assert.equal(alarmActive, true);
  inbox.messages[0].acknowledged = true;
  renderToStaticMarkup(React.createElement(panel.default));
  assert.equal(alarmActive, false);
});

test('selected message replaces a long inbox and terminal requests expose no invalid actions', () => {
  const message = { id: 'selected', created_at: '2026-11-26T12:00:00Z', from_station: 'DLH324', to_station: 'IRFD', kind: 'CLEARANCE', body: 'CLEARANCE REQUEST\nFLT NO DLH324', incoming: true, acknowledged: true, status: 'SENT' };
  inbox = { available: true, user_id: 'atc', stations: [], messages: [message, ...Array.from({ length: 500 }, (_, index) => ({ ...message, id: `older-${index}` }))] };
  function renderSelected() {
    let stateIndex = 0;
    const SelectedPanel = load('src/components/cpdlc/AtcCpdlcPanel.tsx', {
      ...common,
      react: { ...React, useState(initial) { const index = stateIndex++; return React.useState(index === 0 ? true : index === 1 ? 'selected' : initial); } },
      'react-dom': { createPortal: children => children },
    }).default;
    const previous = global.document;
    global.document = { body: {} };
    try { return renderToStaticMarkup(React.createElement(SelectedPanel)); }
    finally { if (previous === undefined) delete global.document; else global.document = previous; }
  }
  const pending = renderSelected();
  assert.match(pending, /BACK TO INBOX/);
  assert.match(pending, /CLEARANCE REQUEST/);
  assert.doesNotMatch(pending, /<table/);
  assert.match(pending, /> REPLY<\/button>/);
  assert.match(pending, />TRANSFER<\/button>/);
  for (const status of ['CLEAR', 'REFUSED']) {
    message.status = status;
    const answered = renderSelected();
    assert.match(answered, /ALREADY BEEN ANSWERED/);
    assert.doesNotMatch(answered, /> REPLY<\/button>|>TRANSFER<\/button>/);
  }
});

test('navbar exposes communications only for an active station and retains keyboard menu buttons', () => {
  const componentStub = label => ({ __esModule: true, default: () => React.createElement('span', null, label) });
  const Navbar = load('src/components/AtcNavBar.tsx', {
    ...common,
    'next/navigation': { usePathname: () => '/atc', useRouter: () => ({}) },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/lib/supabase/client': { createClient() {} },
    '@/components/StationComBox': componentStub('COMBOX'),
    '@/components/AtcAtisButton': componentStub('ATIS'),
    '@/components/AtcTelephone': componentStub('PHONE'),
    '@/components/AtcPhonebookButton': componentStub('DIRECTORY'),
    '@/components/cpdlc/AtcCpdlcPanel': componentStub('CPDLC'),
  }).default;
  const active = renderToStaticMarkup(React.createElement(Navbar, { isAdmin: true, enService: true, userId: 'controller', sessionInfo: { aeroport: 'IRFD', position: 'Tower', started_at: '2026-11-26T12:00:00Z' } }));
  for (const label of ['COMBOX', 'CPDLC', 'ATIS', 'PHONE', 'DIRECTORY']) assert.ok(active.includes(label));
  assert.match(active, /aria-label="Outils et pages ATC"/);
  assert.match(active, /aria-label="Options du compte ATC"/);
  const inactive = renderToStaticMarkup(React.createElement(Navbar, { isAdmin: false, enService: false }));
  assert.doesNotMatch(inactive, /COMBOX|CPDLC|ATIS|PHONE|DIRECTORY/);
  assert.match(inactive, /Prendre mon service/);
});
