'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, ChevronDown, Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  hasCompagniePDG: boolean;
};

export default function FelitzBankMenu({ hasCompagniePDG }: Props) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = pathname.startsWith('/felitz-bank');

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-slate-700/50 text-sky-300'
            : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
        )}
      >
        <Wallet className="h-4 w-4" />
        Felitz Bank
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-lg border border-slate-700/50 bg-slate-800 shadow-lg">
            <div className="p-1">
              <Link
                href="/felitz-bank/compte-personnel"
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full',
                  pathname === '/felitz-bank/compte-personnel'
                    ? 'bg-slate-700/50 text-sky-300'
                    : 'text-slate-300 hover:bg-slate-700/30'
                )}
              >
                <User className="h-4 w-4" />
                Compte personnel
              </Link>
              {hasCompagniePDG && (
                <Link
                  href="/felitz-bank/compte-pdg"
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full',
                    pathname === '/felitz-bank/compte-pdg'
                      ? 'bg-slate-700/50 text-sky-300'
                      : 'text-slate-300 hover:bg-slate-700/30'
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  Compte PDG
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
