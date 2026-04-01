'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function EasterThemeController() {
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
      body.classList.remove('easter-theme');
    } else {
      body.classList.add('easter-theme');
    }
  }, [pathname]);

  return null;
}
