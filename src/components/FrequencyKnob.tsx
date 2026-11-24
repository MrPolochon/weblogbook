'use client';

import { useEffect, useRef } from 'react';
import { bindRadioWheel } from '@/lib/radio-wheel';

export default function FrequencyKnob({ part, value, onStep }: {
  part: 'mhz' | 'decimal'; value: number; onStep: (direction: number) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const step = useRef(onStep);
  step.current = onStep;
  useEffect(() => {
    if (element.current) return bindRadioWheel(element.current, direction => step.current(direction));
  }, []);
  return <div ref={element} role="spinbutton" tabIndex={0}
    aria-label={part === 'mhz' ? 'Molette MHz' : 'Molette décimales'}
    aria-valuemin={part === 'mhz' ? 118 : 0} aria-valuemax={part === 'mhz' ? 136 : 990} aria-valuenow={value}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      onStep(['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1);
    }}
    className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-4 border-double border-slate-500 bg-gradient-to-br from-slate-500 to-slate-900 shadow-inner outline-none focus:ring-2 focus:ring-sky-400">
    <button type="button" aria-label={part === 'mhz' ? 'Augmenter les MHz' : 'Augmenter les décimales'} onClick={() => onStep(1)} className="w-full rounded-t-full text-sm leading-5 hover:text-sky-300">+</button>
    <button type="button" aria-label={part === 'mhz' ? 'Diminuer les MHz' : 'Diminuer les décimales'} onClick={() => onStep(-1)} className="w-full rounded-b-full text-sm leading-5 hover:text-sky-300">−</button>
  </div>;
}
