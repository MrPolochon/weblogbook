'use client';

import { useEffect } from 'react';

export default function AtcModeBg({ isAdmin }: { isAdmin: boolean }) {
  useEffect(() => {
    document.body.classList.add(isAdmin ? 'atc-admin-bg' : 'atc-normal-bg');
    return () => {
      document.body.classList.remove('atc-admin-bg', 'atc-normal-bg');
    };
  }, [isAdmin]);
  return null;
}
