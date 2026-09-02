'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function AtcMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isConsole = pathname === '/atc';

  return (
    <main
      className={cn(
        'flex-1 min-w-0 min-h-0',
        isConsole
          ? 'overflow-hidden px-2 py-2 sm:px-3 lg:px-4 flex flex-col'
          : 'overflow-auto px-4 py-5 sm:px-5 lg:px-6',
      )}
    >
      {children}
    </main>
  );
}
