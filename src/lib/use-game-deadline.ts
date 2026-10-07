'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/** Wall-clock deadline, with current results and no side effects in state updaters. */
export function useGameDeadline(active: boolean, duration: number, onTick: (seconds: number) => void, onExpire: () => void) {
  const callbacks = useRef({ onTick, onExpire });
  useLayoutEffect(() => { callbacks.current = { onTick, onExpire }; });
  useEffect(() => {
    if (!active) return;
    const deadline = performance.now() + duration * 1000;
    let expired = false;
    const update = () => {
      if (expired) return;
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      callbacks.current.onTick(remaining);
      if (remaining === 0) { expired = true; callbacks.current.onExpire(); }
    };
    const timer = setInterval(update, 100);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [active, duration]);
}
