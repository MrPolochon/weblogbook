'use client';

import { useEffect } from 'react';

/** Stop decorative CSS work when the tab cannot be seen. */
export default function MotionLifecycle() {
  useEffect(() => {
    const update = () => { document.documentElement.dataset.pageHidden = String(document.hidden); };
    update();
    document.addEventListener('visibilitychange', update);
    return () => { document.removeEventListener('visibilitychange', update); delete document.documentElement.dataset.pageHidden; };
  }, []);
  return null;
}
