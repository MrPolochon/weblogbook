'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { pathnameUsesEasterSkin } from '@/lib/easter-skin';

export default function ThemedToaster() {
  const pathname = usePathname();
  const easter = pathnameUsesEasterSkin(pathname);

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        className: easter
          ? '!bg-violet-950/90 !border-fuchsia-300/30 !text-fuchsia-50 !shadow-2xl backdrop-blur-xl'
          : '!bg-slate-900/95 !border-slate-600/35 !text-slate-100 !shadow-2xl backdrop-blur-xl',
        duration: 4000,
      }}
      richColors
      closeButton
    />
  );
}
