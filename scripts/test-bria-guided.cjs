const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, deps = {}, globals = {}) {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(globals), js)(
    name => Object.hasOwn(deps, name) ? deps[name] : require(name), m, m.exports, ...Object.values(globals),
  );
  return m.exports;
}
const helper = load('src/lib/bria/briefing.ts');
const complete = {
  departure: 'IRFD', arrival: 'ITKO', callsign: 'MON-INDICATIF', aircraft: 'A320',
  registration: 'F-TEST', departureUtc: '18:45', durationMinutes: '35',
  flightRules: 'IFR', sid: 'Sans SID', star: 'Sans STAR',
};

test('BRIA reviews the actual manual callsign and preserves every draft value', () => {
  const draft = Object.freeze({ ...complete, passengerCount: 17, cargoKg: 412, cargoType: 'fragile' });
  const before = JSON.stringify(draft);
  const b = helper.buildBriaBriefing(draft);
  assert.equal(b.missing.length, 0);
  assert.ok(b.lines.some(line => line.includes('MON-INDICATIF')));
  assert.equal(JSON.stringify(draft), before);
  assert.match(b.speechText, /dépôt.*formulaire/);
});

test('BRIA identifies missing IFR procedures, UTC and duration without pretending validation succeeded', () => {
  const b = helper.buildBriaBriefing({ ...complete, sid: '', star: '', departureUtc: '26:61', durationMinutes: '1.5' });
  assert.equal(b.missing.length, 4);
  assert.ok(b.missing.some(item => item.includes('SID')));
  assert.ok(b.missing.some(item => item.includes('UTC')));
});

test('VFR needs intentions and does not require IFR procedures', () => {
  const b = helper.buildBriaBriefing({ ...complete, flightRules: 'VFR', intentions: '', sid: '', star: '' });
  assert.deepEqual(b.missing, ['Décrire vos intentions de vol VFR.']);
  assert.equal(helper.buildBriaBriefing({ ...complete, flightRules: 'VFR', intentions: 'Tour de piste' }).missing.length, 0);
});

function walk(el) {
  if (!el || typeof el !== 'object') return [];
  if (Array.isArray(el)) return el.flatMap(walk);
  return [el, ...walk(el.props?.children)];
}
function text(el) {
  if (Array.isArray(el)) return el.map(text).join('');
  return el && typeof el === 'object' ? text(el.props?.children) : typeof el === 'string' ? el : '';
}

function mount({ supported = true, externalSpeech = false, draft = complete, availableSteps = [true, true, true] } = {}) {
  const old = Object.fromEntries(['window', 'document', 'HTMLElement'].map(k => [k, global[k]]));
  const state = [], effects = [], cleanups = [], timers = new Map(), speech = [], events = new Map();
  let cursor = 0, tree, closed = 0, cancels = 0, timerId = 0;
  const visited = [], elements = new Map();
  class Element {
    isConnected = true;
    focus() { document.activeElement = this; }
  }
  const opener = new Element();
  const document = { body: {}, activeElement: opener };
  const synth = { speaking: externalSpeech, speak(u) { speech.push(u); this.speaking = true; }, cancel() { cancels++; this.speaking = false; } };
  const window = {
    ...(supported ? { speechSynthesis: synth, SpeechSynthesisUtterance: class { constructor(value) { this.text = value; } } } : {}),
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name) { events.delete(name); },
  };
  global.window = window; global.document = document; global.HTMLElement = Element;
  const react = {
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(fn); } },
  };
  const component = load('src/components/BriaDialog.tsx', {
    react, 'react-dom': { createPortal: value => value }, '@/lib/bria/briefing': helper,
  }, {
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => { timers.delete(id); },
    fetch: () => { throw Error('BRIA must not make requests'); },
  });
  function controls() {
    return walk(tree).filter(el => el.type === 'button' && !el.props.disabled).map(el => {
      const key = el.props['aria-label'] || text(el);
      if (!elements.has(key)) elements.set(key, new Element());
      return elements.get(key);
    });
  }
  const dialog = {
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    querySelector() { return controls()[0]; },
    querySelectorAll: controls,
  };
  function render() {
    cursor = 0;
    tree = component.default({
      onClose: () => { closed++; }, draft, availableSteps, onReviewStep: step => visited.push(step),
    });
    tree.props.ref.current = dialog;
    for (const effect of effects.splice(0)) cleanups.push(effect());
    return tree;
  }
  render(); render();
  return {
    render, get tree() { return tree; }, dialog, opener, document, timers, events, speech, synth, visited,
    get cancels() { return cancels; }, get closed() { return closed; },
    button(label) { return walk(tree).find(el => el.type === 'button' && (el.props['aria-label'] === label || text(el) === label)); },
    controls,
    cleanup() {
      for (const cleanup of cleanups) cleanup?.();
      for (const [k, value] of Object.entries(old)) { if (value === undefined) delete global[k]; else global[k] = value; }
    },
  };
}

test('text-only browser opens an accessible modal with no microphone, request or automatic audio', () => {
  const c = mount({ supported: false });
  try {
    assert.equal(c.tree.type, 'dialog');
    assert.equal(c.tree.props['aria-labelledby'], 'bria-title');
    assert.equal(c.dialog.open, true);
    assert.equal(c.button('Lire le briefing').props.disabled, true);
    assert.match(text(c.tree), /MON-INDICATIF/);
    assert.match(text(c.tree), /ne crée aucun plan de vol/);
    assert.equal(c.speech.length, 0);
    assert.equal(c.timers.size, 0);
    assert.ok(!walk(c.tree).some(el => el.type === 'input' || el.props?.type === 'submit'));
  } finally { c.cleanup(); }
});

test('Escape closes once, cancels native cancel and restores focus to the opener on unmount', () => {
  const c = mount();
  let prevented = 0;
  try {
    c.tree.props.onKeyDown({ key: 'Escape', preventDefault() { prevented++; } });
    c.tree.props.onCancel({ preventDefault() { prevented++; } });
    assert.equal(c.closed, 1);
    assert.equal(prevented, 2);
  } finally { c.cleanup(); }
  assert.equal(c.dialog.open, false);
  assert.equal(c.document.activeElement, c.opener);
  assert.equal(c.events.size, 0);
});

test('Tab stays inside the modal and the review links honor incomplete wizard steps', () => {
  const c = mount({ availableSteps: [true, false, false] });
  try {
    const controls = c.controls(); let prevented = 0;
    c.document.activeElement = controls.at(-1);
    c.tree.props.onKeyDown({ key: 'Tab', shiftKey: false, preventDefault() { prevented++; } });
    assert.equal(c.document.activeElement, controls[0]);
    c.tree.props.onKeyDown({ key: 'Tab', shiftKey: true, preventDefault() { prevented++; } });
    assert.equal(c.document.activeElement, controls.at(-1));
    assert.equal(prevented, 2);
    assert.equal(c.button('Horaires et procédures').props.disabled, true);
    assert.equal(c.button('Récapitulatif').props.disabled, true);
    c.button('Appareil et route').props.onClick();
    assert.deepEqual(c.visited, [1]);
  } finally { c.cleanup(); }
});

test('voice starts only on click and close releases only the owned audio and timer', () => {
  const c = mount();
  try {
    assert.equal(c.speech.length, 0);
    c.button('Lire le briefing').props.onClick();
    assert.equal(c.speech.length, 1);
    assert.match(c.speech[0].text, /MON-INDICATIF/);
    assert.equal(c.timers.size, 1);
    c.render();
    assert.equal(c.button('Lire le briefing').props.disabled, true);
    assert.equal(c.button('Arrêter la lecture').props.disabled, false);
    c.button('Fermer le briefing').props.onClick();
    assert.equal(c.cancels, 1);
    assert.equal(c.timers.size, 0);
    assert.equal(c.speech[0].onend, null);
    assert.equal(c.speech[0].onerror, null);
  } finally { c.cleanup(); }
  assert.equal(c.cancels, 1);
});

test('opening and closing BRIA never cancels another ATC voice playback', () => {
  const c = mount({ externalSpeech: true });
  try {
    c.button('Lire le briefing').props.onClick(); c.render();
    assert.equal(c.speech.length, 0);
    assert.match(text(c.tree), /autre lecture est en cours/);
    c.button('Fermer le briefing').props.onClick();
    assert.equal(c.cancels, 0);
  } finally { c.cleanup(); }
});

test('speech error keeps text and navigation usable; hiding page stops its own audio', () => {
  const c = mount();
  try {
    c.button('Lire le briefing').props.onClick();
    c.synth.speaking = false;
    c.speech[0].onerror();
    c.render();
    assert.equal(c.timers.size, 0);
    assert.match(text(c.tree), /lecture vocale a été interrompue/);
    assert.equal(c.button('Lire le briefing').props.disabled, false);
    c.button('Lire le briefing').props.onClick();
    c.events.get('pagehide')();
    assert.equal(c.cancels, 1);
    assert.equal(c.timers.size, 0);
  } finally { c.cleanup(); }
});

test('unmount during playback cancels owned audio without late callbacks', () => {
  const c = mount();
  c.button('Lire le briefing').props.onClick();
  c.cleanup();
  assert.equal(c.cancels, 1);
  assert.equal(c.timers.size, 0);
  assert.equal(c.speech[0].onerror, null);
});

function route(user, fails = false) {
  const api = load('src/app/api/bria-session/route.ts', {
    '@/lib/supabase/server': { createClient: async () => {
      if (fails) throw Error('Session unavailable');
      return { auth: { getUser: async () => ({ data: { user } }) } };
    } },
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
  }, { fetch: () => { throw Error('No external session request is permitted'); } });
  return api;
}

test('legacy BRIA session stays authenticated and advertises guided capability with no quota', async () => {
  for (const method of ['GET', 'POST']) assert.equal((await route(null)[method]()).status, 401);
  const get = await route({ id: 'pilot' }).GET();
  assert.equal(get.status, 200); assert.equal(get.body.remainingMs, 0);
  assert.equal(get.body.requiresMicrophone, false); assert.equal(get.body.canSubmitPlan, false);
  const post = await route({ id: 'pilot' }).POST();
  assert.equal(post.status, 410);
  assert.equal(post.body.mode, 'guided');
  assert.equal(post.body.signedUrl, undefined);
  assert.equal((await route(null, true).GET()).status, 500);
});

function toolsFixture({ failure = false, malformed = false } = {}) {
  const calls = [], estimates = [];
  const tools = load('src/lib/bria/tools.ts', {
    '@/lib/aeroports-ptfs': {
      getAeroportInfo: code => ({ passagersMax: code === 'IRFD' ? 1000 : 4000, cargoMax: code === 'IRFD' ? 2000 : 8000 }),
      estimerPassagers: (...args) => { estimates.push(args); return { passagers: args[4], remplissage: 0.4, revenus: 50 }; },
      estimerCargo: (...args) => { estimates.push(args); return { cargo: args[4], chargement: 0.4, revenus: 50 }; },
    },
  }, { fetch: async url => {
    calls.push(url);
    if (url.startsWith('/api/avions/lookup')) return Response.json({ capacite_pax: 100, capacite_cargo_kg: 500, prix_billet_pax: 100, prix_kg_cargo: 2 });
    if (failure) return new Response('{}', { status: 503 });
    if (malformed) return Response.json([]);
    return Response.json(url.includes('code_oaci=IRFD')
      ? { passagers_disponibles: 80, cargo_disponible: 160, last_flight_arrival: '2026-10-01T00:00:00Z' }
      : { passagers_disponibles: 20, cargo_disponible: 40, last_flight_arrival: '2026-10-20T00:00:00Z' });
  } }).createBriaClientTools();
  return { tools, calls, estimates };
}

for (const type of ['pax', 'cargo']) {
  test('legacy ' + type + ' estimate separates departure stock from destination isolation', async () => {
    const c = toolsFixture();
    const result = JSON.parse(await c.tools.estimate_load({ code_oaci_depart: 'irfd', code_oaci_arrivee: 'itko', immatriculation: 'F-TEST', type }));
    assert.ok(!result.error);
    assert.equal('submit_flight_plan' in c.tools, false);
    assert.ok(c.calls.some(url => url.includes('code_oaci=IRFD')));
    assert.ok(c.calls.some(url => url.includes('code_oaci=ITKO')));
    const args = c.estimates[0];
    assert.equal(args[4], type === 'pax' ? 80 : 160);
    assert.equal(args[5][type === 'pax' ? 'ratioPaxDispo' : 'ratioCargoDispo'], 0.08);
    assert.equal(args[5].lastArrivalAtArrivee.toISOString(), '2026-10-20T00:00:00.000Z');
  });
}

test('unavailable stock never fabricates a full aircraft estimate', async () => {
  for (const scenario of [{ failure: true }, { malformed: true }]) {
    for (const type of ['pax', 'cargo']) {
      const c = toolsFixture(scenario);
      assert.match(JSON.parse(await c.tools.estimate_load({ code_oaci_depart: 'IRFD', code_oaci_arrivee: 'ITKO', immatriculation: 'F-TEST', type })).error, /indisponible/);
      assert.equal(c.estimates.length, 0);
    }
  }
});
