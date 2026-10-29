'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isPilotWorkspacePath } from '@/lib/pilot-navigation';

const BODY_CLASS = 'admin-mode';
const PILOT_SUMMER_CLASS = 'pilot-summer-mode';
const PILOT_PROFESSIONAL_CLASS = 'pilot-professional-mode';

export default function AdminModeBg() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.classList.remove(BODY_CLASS, PILOT_SUMMER_CLASS, PILOT_PROFESSIONAL_CLASS);
    if (pathname.startsWith('/admin')) {
      document.body.classList.add(BODY_CLASS);
    } else if (isPilotWorkspacePath(pathname)) {
      document.body.classList.add(PILOT_PROFESSIONAL_CLASS);
    } else {
      document.body.classList.add(PILOT_SUMMER_CLASS);
    }
    return () => {
      document.body.classList.remove(BODY_CLASS);
      document.body.classList.remove(PILOT_SUMMER_CLASS);
      document.body.classList.remove(PILOT_PROFESSIONAL_CLASS);
    };
  }, [pathname]);

  return null;
}
