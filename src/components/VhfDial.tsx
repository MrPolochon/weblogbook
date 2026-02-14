'use client';

import { useRef, useCallback, useEffect, useState } from 'react';

interface VhfDialProps {
  values: string[];
  currentIndex: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  label?: string;
  /** Diamètre du dial en px */
  size?: number;
}

/**
 * Molette rotative circulaire VHF.
 * Contrôlable via :
 *  - Scroll molette souris (wheel)
 *  - Drag vertical (mousedown + mousemove)
 *  - Flèches haut/bas (quand focus)
 */
export default function VhfDial({
  values,
  currentIndex,
  onChange,
  disabled = false,
  label,
  size = 72,
}: VhfDialProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartIndex = useRef(currentIndex);
  const [rotation, setRotation] = useState(0);

  // Angle par step
  const anglePerStep = 360 / Math.min(values.length, 40);

  // Synchronise la rotation visuelle avec l'index
  useEffect(() => {
    setRotation(currentIndex * anglePerStep);
  }, [currentIndex, anglePerStep]);

  const clampIndex = useCallback(
    (idx: number) => {
      if (idx < 0) return 0;
      if (idx >= values.length) return values.length - 1;
      return idx;
    },
    [values.length]
  );

  const step = useCallback(
    (delta: number) => {
      if (disabled) return;
      const newIdx = clampIndex(currentIndex + delta);
      if (newIdx !== currentIndex) onChange(newIdx);
    },
    [currentIndex, clampIndex, onChange, disabled]
  );

  // Wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      const delta = e.deltaY > 0 ? 1 : -1;
      step(delta);
    },
    [step, disabled]
  );

  // Drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragStartIndex.current = currentIndex;

      const handleMouseMove = (ev: MouseEvent) => {
        if (dragStartY.current === null) return;
        const dy = dragStartY.current - ev.clientY;
        const steps = Math.round(dy / 8); // 8px par step
        const newIdx = clampIndex(dragStartIndex.current + steps);
        if (newIdx !== currentIndex) onChange(newIdx);
      };

      const handleMouseUp = () => {
        dragStartY.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [currentIndex, clampIndex, onChange, disabled]
  );

  // Keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    },
    [step, disabled]
  );

  const displayValue = values[currentIndex] ?? '---';

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      )}
      <div
        ref={containerRef}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-valuenow={currentIndex}
        aria-valuemin={0}
        aria-valuemax={values.length - 1}
        aria-label={label || 'VHF dial'}
        className={`relative select-none outline-none rounded-full border-2 flex items-center justify-center
          ${disabled
            ? 'border-slate-600 bg-slate-800 cursor-not-allowed opacity-60'
            : 'border-emerald-500/60 bg-slate-900 cursor-grab active:cursor-grabbing hover:border-emerald-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30'
          }`}
        style={{ width: size, height: size }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      >
        {/* Graduation marks */}
        {!disabled && (
          <>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <div
                key={deg}
                className="absolute w-0.5 h-2 bg-slate-600 rounded-full"
                style={{
                  top: 4,
                  left: '50%',
                  transformOrigin: `50% ${size / 2 - 4}px`,
                  transform: `translateX(-50%) rotate(${deg}deg)`,
                }}
              />
            ))}
          </>
        )}

        {/* Indicator notch (the rotating part) */}
        <div
          className="absolute w-1.5 h-3 bg-emerald-400 rounded-full transition-transform duration-100"
          style={{
            top: 3,
            left: '50%',
            transformOrigin: `50% ${size / 2 - 3}px`,
            transform: `translateX(-50%) rotate(${rotation % 360}deg)`,
          }}
        />

        {/* Value display */}
        <span
          className={`font-mono font-bold text-center leading-none ${
            disabled ? 'text-slate-400' : 'text-emerald-300'
          }`}
          style={{ fontSize: size > 64 ? 16 : 13 }}
        >
          {displayValue}
        </span>
      </div>
    </div>
  );
}
