'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { pathnameUsesEasterSkin } from '@/lib/easter-skin';

export default function EasterThemeController() {
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    if (pathnameUsesEasterSkin(pathname)) {
      body.classList.add('easter-theme');
    } else {
      body.classList.remove('easter-theme');
    }
  }, [pathname]);

  return null;
}
