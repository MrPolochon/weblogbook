/** A native, non-passive listener is needed: React's delegated wheel listener is passive. */
export function bindRadioWheel(element: HTMLElement, step: (direction: number) => void) {
  const wheel = (event: WheelEvent) => {
    // Preserve browser zoom / trackpad pinch. Ordinary wheel input belongs to this knob.
    if (event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.deltaY) step(event.deltaY < 0 ? 1 : -1);
  };
  element.addEventListener('wheel', wheel, { passive: false });
  return () => element.removeEventListener('wheel', wheel);
}
