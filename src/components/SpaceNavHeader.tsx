import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Common geometry for every workspace; each space retains its operational controls. */
export default function SpaceNavHeader({ className, ...props }: ComponentProps<'header'>) {
  return <header {...props} className={cn('space-nav-header sticky top-0 z-50 border-b backdrop-blur-xl', className)} />;
}

export const SPACE_NAV_BUTTON = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400';
