/** Pure key catalogue shared by the web recorder and Electron; no Electron APIs here. */
export const PTT_KEY_ARGUMENTS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries({ KeyQ:16, KeyW:17, KeyE:18, KeyR:19, KeyT:20, KeyY:21, KeyU:22, KeyI:23, KeyO:24, KeyP:25,
    KeyA:30, KeyS:31, KeyD:32, KeyF:33, KeyG:34, KeyH:35, KeyJ:36, KeyK:37, KeyL:38,
    KeyZ:44, KeyX:45, KeyC:46, KeyV:47, KeyB:48, KeyN:49, KeyM:50,
    Digit1:2, Digit2:3, Digit3:4, Digit4:5, Digit5:6, Digit6:7, Digit7:8, Digit8:9, Digit9:10, Digit0:11,
    Minus:12, Equal:13, BracketLeft:26, BracketRight:27, Semicolon:39, Quote:40, Backquote:41,
    Backslash:43, Comma:51, Period:52, Slash:53, IntlBackslash:86 }).map(([code, scan]) => [code, `scan:${scan}`])),
  Space:'32', Tab:'9', Backspace:'8', Enter:'13', NumpadEnter:'13',
  ShiftLeft:'160', ShiftRight:'161', ControlLeft:'162', ControlRight:'163', AltLeft:'164', AltRight:'165',
  ArrowLeft:'37', ArrowUp:'38', ArrowRight:'39', ArrowDown:'40', PageUp:'33', PageDown:'34', Home:'36', End:'35', Insert:'45', Delete:'46',
  CapsLock:'20', NumLock:'144', ScrollLock:'145', Pause:'19', PrintScreen:'44', ContextMenu:'93',
  NumpadMultiply:'106', NumpadAdd:'107', NumpadSubtract:'109', NumpadDecimal:'110', NumpadDivide:'111',
  ...Object.fromEntries(Array.from({length:10},(_,i)=>[`Numpad${i}`,String(96+i)])),
  ...Object.fromEntries(Array.from({length:24},(_,i)=>[`F${i+1}`,String(112+i)])),
};
export function isPttKeyCode(code: string): boolean { return Object.prototype.hasOwnProperty.call(PTT_KEY_ARGUMENTS, code); }
