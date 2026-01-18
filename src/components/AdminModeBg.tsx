'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const BODY_CLASS = 'admin-mode';

export default function AdminModeBg() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith('/admin')) {
      document.body.classList.add(BODY_CLASS);
    } else {
      document.body.classList.remove(BODY_CLASS);
    }
    return () => document.body.classList.remove(BODY_CLASS);
  }, [pathname]);

  return null;
}
