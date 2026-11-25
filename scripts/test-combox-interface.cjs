const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}

// Exercise the component's real handlers and effect lifecycles without a browser or microphone.
function harness(t, { defaultFrequency = '118.925', desktop = null } = {}) {
  const savedGlobals = new Map();
  function install(name, value) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  class Node {
    contains(target) { for (let node = target; node; node = node.parent) if (node === this) return true; return false; }
    getBoundingClientRect() { return { left: 100, bottom: 52 }; }
    focus() { document.activeElement = this; }
  }
  function eventHub() {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      dispatch(type, details = {}) {
        const event = { target: new Node(), preventDefault() { this.defaultPrevented = true; },
          stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...details };
        for (const fn of [...(listeners.get(type) || [])]) { fn(event); if (event.stopped) break; }
        return event;
      },
    };
  }
  const document = { ...eventHub(), body: new Node(), activeElement: null, hasFocus: () => true };
  const window = { ...eventHub(), innerWidth: 1280, innerHeight: 800 };
  const storage = new Map();
  install('Node', Node); install('document', document); install('window', window); install('navigator', {});
  install('localStorage', { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) });
  install('ResizeObserver', class { observe() {} disconnect() {} });
  install('requestAnimationFrame', () => 1); install('cancelAnimationFrame', () => {});

  let cursor = 0, dirty = true, tree, nodes = [], pending = [];
  const slots = [], refs = new WeakMap();
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  function effect(fn, deps) {
    const i = cursor++, previous = slots[i];
    if (previous && !changed(previous.deps, deps)) return;
    slots[i] = { deps, fn, cleanup: previous?.cleanup, effect: true };
    pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
  }
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(slots[i], next)) { slots[i] = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] || (slots[i] = { current: initial }); },
    useId() { cursor++; return 'com-test'; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect: effect, useLayoutEffect: effect,
  };
  const calls = { connect: [], disconnect: 0, press: [], release: [], releaseAll: 0, modes: [] };
  const radio = {
    frequency: '', connection: 'disconnected', powered: false, receiveOnly: false, mode: 'muted', micReady: false,
    preparingMic: false, transmitting: false, participants: [], volume: 1, effects: false, error: '', audioBlocked: false,
    connect: async frequency => { calls.connect.push(frequency); radio.frequency = frequency; radio.powered = true; radio.connection = 'connected'; dirty = true; },
    disconnect: () => { calls.disconnect++; radio.powered = false; radio.connection = 'disconnected'; dirty = true; },
    press: source => calls.press.push(source), release: source => calls.release.push(source), releaseAll: () => calls.releaseAll++,
    setMicMode: async mode => { calls.modes.push(mode); radio.mode = mode; radio.micReady = mode !== 'muted'; dirty = true; },
    setVolume() {}, setEffects() {}, resumeAudio() {},
  };
  const keys = load('vhf-radio-app/electron/ptt-keys.ts');
  const shortcuts = load('src/lib/radio-shortcut.ts', { '../../vhf-radio-app/electron/ptt-keys': keys });
  const jsx = (type, props) => ({ type, props });
  const ComBox = load('src/components/ComBox.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-dom': { createPortal: child => child },
    'next/navigation': { usePathname: () => '/atc' }, 'lucide-react': {}, '@/components/FrequencyKnob': () => null,
    '@/lib/radio-desktop': { radioDesktop: () => desktop }, '@/lib/cloudflare/client': { ConnectionState: { Connected: 'connected', Disconnected: 'disconnected' } },
    '@/hooks/useVhfRadio': { useVhfRadio: () => radio }, '@/lib/vhf-frequencies': load('src/lib/vhf-frequencies.ts'),
    '@/lib/radio-transmission': { isRadioTypingTarget: target => target?.tagName === 'INPUT' }, '@/lib/radio-shortcut': shortcuts,
  }).default;
  let props = { participantName: 'Test ATC', station: { aeroport: 'IRFD', position: 'Tower' }, placement: 'toolbar', defaultFrequency };
  function materialize(value, parent) {
    if (Array.isArray(value)) { value.forEach(child => materialize(child, parent)); return; }
    if (!value || typeof value !== 'object') return;
    const ref = value.props?.ref;
    const node = ref ? refs.get(ref) || new Node() : new Node();
    node.parent = parent; value.node = node; nodes.push(value);
    if (ref) { refs.set(ref, node); ref.current = node; }
    materialize(value.props?.children, node);
  }
  function flush() {
    let attempts = 0;
    do {
      assert.ok(attempts++ < 20, 'component settles without a render loop');
      dirty = false; cursor = 0; pending = []; nodes = [];
      tree = ComBox(props); materialize(tree, null);
      pending.forEach(run => run());
    } while (dirty);
  }
  const content = value => Array.isArray(value) ? value.map(content).join('') : value && typeof value === 'object' ? content(value.props?.children) : value == null || value === false ? '' : String(value);
  const find = predicate => { const node = nodes.find(predicate); assert.ok(node, 'requested control exists'); return node; };
  const trigger = () => find(node => node.props?.['aria-haspopup'] === 'dialog');
  t.after(() => {
    slots.filter(slot => slot?.effect).forEach(slot => slot.cleanup?.());
    for (const [name, descriptor] of savedGlobals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  });
  flush();
  return { radio, calls, storage, window, document, flush, find, trigger,
    button: label => find(node => node.type === 'button' && content(node).includes(label)),
    open() { trigger().props.onClick(); flush(); },
    isOpen: () => nodes.some(node => node.props?.role === 'dialog'),
    update(next) { props = { ...props, ...next }; dirty = true; flush(); },
    replayEffects() { const effects = slots.filter(slot => slot?.effect); effects.forEach(slot => slot.cleanup?.()); effects.forEach(slot => { slot.cleanup = slot.fn(); }); flush(); },
  };
}

test('toolbar starts closed on the official frequency with microphone muted', t => {
  const h = harness(t);
  assert.equal(h.isOpen(), false); assert.deepEqual(h.calls.connect, ['118.925']);
  assert.equal(h.radio.mode, 'muted'); assert.deepEqual(h.calls.modes, []);
  h.replayEffects();
  assert.equal(h.radio.powered, true, 'Strict Mode setup/cleanup replay must reconnect');
});

test('outside click closes without swallowing the flight click or disconnecting reception', t => {
  const h = harness(t); h.open();
  const panel = h.find(node => node.props?.role === 'dialog');
  h.document.dispatch('pointerdown', { target: panel.node }); h.flush(); assert.equal(h.isOpen(), true);
  const outside = h.document.dispatch('pointerdown'); h.flush();
  assert.equal(h.isOpen(), false); assert.equal(outside.defaultPrevented, undefined);
  assert.equal(h.calls.disconnect, 0); assert.equal(h.radio.powered, true);
  h.open(); h.document.dispatch('keydown', { key: 'Escape' }); h.flush();
  assert.equal(h.isOpen(), false); assert.equal(h.document.activeElement, h.trigger().node);
});

test('manual tuning and OFF survive default-frequency refreshes', t => {
  const h = harness(t); h.open();
  h.find(node => node.type === 'input' && node.props.inputMode === 'decimal').props.onChange({ target: { value: '123.450' } }); h.flush();
  h.find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Basculer')).props.onClick(); h.flush();
  h.update({ defaultFrequency: '118.950' });
  assert.deepEqual(h.calls.connect, ['118.925', '123.450']);
  h.button('OFF').props.onClick(); h.flush(); h.update({ defaultFrequency: '118.925' });
  assert.equal(h.radio.powered, false); assert.equal(h.calls.connect.length, 2);
});

test('PTT captures the physical key after release, persists its local label and works with the panel closed', t => {
  const h = harness(t); h.open(); h.button('Push-to-talk').props.onClick(); h.flush();
  h.button('Définir une touche').props.onClick(); h.flush();
  h.window.dispatch('keydown', { code: 'KeyQ', key: 'a' }); h.flush();
  assert.equal(h.storage.get('combox-shortcut'), undefined); assert.deepEqual(h.calls.press, []);
  h.window.dispatch('keyup', { code: 'KeyQ', key: 'a' }); h.flush();
  assert.equal(h.storage.get('combox-shortcut'), 'KeyQ'); assert.equal(h.storage.get('combox-shortcut-label'), 'A'); assert.deepEqual(h.calls.press, []);
  h.document.dispatch('pointerdown'); h.flush();
  h.window.dispatch('keydown', { code: 'KeyQ', key: 'a' }); assert.deepEqual(h.calls.press, ['keyboard']);
  h.window.dispatch('keyup', { code: 'KeyQ', key: 'a', target: { tagName: 'INPUT' } }); assert.equal(h.calls.release.at(-1), 'keyboard');
  h.window.dispatch('keydown', { code: 'KeyQ', key: 'a', target: { tagName: 'INPUT' } }); assert.equal(h.calls.press.length, 1);
});

test('canceling key capture does not replace a saved binding or transmit', t => {
  const h = harness(t); h.open(); h.button('Définir une touche').props.onClick(); h.flush();
  h.window.dispatch('keydown', { code: 'F8', key: 'F8' });
  h.document.dispatch('pointerdown'); h.flush();
  h.window.dispatch('keyup', { code: 'F8', key: 'F8' }); h.flush();
  assert.equal(h.storage.size, 0); assert.deepEqual(h.calls.press, []);
});

test('native PTT registration stays enabled when the compact panel closes', t => {
  const configured = [];
  const desktop = { configure: async key => { configured.push(key); return true; }, onPtt: () => () => {} };
  const h = harness(t, { desktop }); h.open(); h.button('Push-to-talk').props.onClick(); h.flush();
  h.button('Définir une touche').props.onClick(); h.flush();
  h.window.dispatch('keydown', { code: 'F9', key: 'F9' }); h.window.dispatch('keyup', { code: 'F9', key: 'F9' }); h.flush();
  assert.equal(configured.at(-1), 'F9');
  h.document.dispatch('pointerdown'); h.flush();
  assert.equal(configured.at(-1), 'F9'); assert.equal(h.calls.disconnect, 0);
});
