'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { activePilotSection, isPilotWorkspacePath, PILOT_SECTIONS } from '@/lib/pilot-navigation';

export default function PilotWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isPilotWorkspacePath(pathname)) return children;
  const active = activePilotSection(pathname);
  return (
    <div className="pilot-workspace">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 pb-3">
        <nav aria-label="Rubriques de l’espace pilote" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
          {PILOT_SECTIONS.map(item => (
            <Link key={item.href} href={item.href} aria-current={active === item.href ? 'page' : undefined}
              title={item.description}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${active === item.href ? 'bg-sky-500/10 text-sky-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        {pathname !== '/logbook/depot-plan-vol' && <Link href="/logbook/depot-plan-vol" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-sky-600/60 bg-sky-600/15 px-3 text-sm font-semibold text-sky-200 hover:bg-sky-600/25">
          Préparer un vol <ArrowUpRight aria-hidden className="h-4 w-4" />
        </Link>}
      </div>
      {children}
    </div>
  );
}
