'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const BODY_CLASS = 'admin-mode';
const PILOT_SUMMER_CLASS = 'pilot-summer-mode';

export default function AdminModeBg() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith('/admin')) {
      document.body.classList.add(BODY_CLASS);
      document.body.classList.remove(PILOT_SUMMER_CLASS);
    } else {
      document.body.classList.remove(BODY_CLASS);
      document.body.classList.add(PILOT_SUMMER_CLASS);
    }
    return () => {
      document.body.classList.remove(BODY_CLASS);
      document.body.classList.remove(PILOT_SUMMER_CLASS);
    };
  }, [pathname]);

  return null;
}
