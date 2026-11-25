export { isPttKeyCode } from '../../vhf-radio-app/electron/ptt-keys';

export function radioShortcutLabel(code: string, key?: string): string {
  const labels: Record<string, string> = { Space:'Espace', ControlLeft:'Ctrl gauche', ControlRight:'Ctrl droit',
    ShiftLeft:'Maj gauche', ShiftRight:'Maj droite', AltLeft:'Alt gauche', AltRight:'Alt droit',
    Enter:'Entrée', NumpadEnter:'Entrée', Tab:'Tabulation', Backspace:'Retour arrière', Delete:'Suppr',
    ArrowLeft:'Flèche gauche', ArrowRight:'Flèche droite', ArrowUp:'Flèche haut', ArrowDown:'Flèche bas' };
  return labels[code] ?? (code.startsWith('Numpad') ? `Pavé ${code.slice(6)}` : key && key.length === 1 ? key.toUpperCase() : code.replace(/^Key|^Digit/, ''));
}
