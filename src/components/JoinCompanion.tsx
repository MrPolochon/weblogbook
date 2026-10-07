'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

type Escape = { x: number; y: number; bridge: { left: number; top: number; right: number; bottom: number } };

export default function JoinCompanion() {
  const link = useRef<HTMLAnchorElement>(null);
  const [escape, setEscape] = useState<Escape | null>(null);
  useEffect(() => {
    if (!escape) return;
    const release = (event: PointerEvent) => {
      const b = escape.bridge;
      const target = event.target;
      if (target instanceof Element && !link.current?.contains(target) && target.closest('button, input, select, textarea, a')) { setEscape(null); return; }
      if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) setEscape(null);
    };
    const cancel = () => setEscape(null);
    window.addEventListener('pointermove', release);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('pointermove', release); window.removeEventListener('blur', cancel); };
  }, [escape]);
  const emerge = () => {
    if (escape || !link.current) return;
    const element = link.current;
    const parent = element.parentElement!;
    const origin = element.getBoundingClientRect();
    const bounds = parent.getBoundingClientRect();
    const width = origin.width, height = 100, gap = 28;
    const cx = origin.left + width / 2, cy = origin.top + origin.height / 2;
    const candidates = [
      { x: bounds.left - width - gap, y: cy - height / 2 },
      { x: bounds.right + gap, y: cy - height / 2 },
      { x: cx - width / 2, y: bounds.top - height - gap },
      { x: cx - width / 2, y: bounds.bottom + gap },
    ];
    const fitting = candidates.filter(p => p.x >= 8 && p.y >= 8 && p.x + width <= innerWidth - 8 && p.y + height <= innerHeight - 8);
    // Use the nearest free outside edge, never a position over the login panels.
    if (!fitting.length) return;
    const position = fitting.sort((a, b) => Math.hypot(a.x + width / 2 - cx, a.y + height / 2 - cy) - Math.hypot(b.x + width / 2 - cx, b.y + height / 2 - cy))[0];
    setEscape({ x: position.x - bounds.left, y: position.y - bounds.top, bridge: {
      left: Math.min(origin.left, position.x) - 8, top: Math.min(origin.top, position.y) - 8,
      right: Math.max(origin.right, position.x + width) + 8, bottom: Math.max(origin.bottom, position.y + height) + 8,
    } });
  };
  return <a ref={link} className="login-join-wanderer" href="https://discord.gg/NfUaC9Kbss" target="_blank" rel="noopener noreferrer"
    data-frightened={escape ? 'true' : undefined} onPointerEnter={emerge} onPointerCancel={() => setEscape(null)}
    style={escape ? { '--join-x': `${escape.x}px`, '--join-y': `${escape.y}px` } as CSSProperties : undefined}>
    <span className="login-join-face" aria-hidden="true"><span className="login-join-eyes"><i /><i /></span><span className="login-join-mouth" /></span>
    <span>Nous rejoindre</span>
  </a>;
}
