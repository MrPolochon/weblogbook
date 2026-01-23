'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, ChevronDown, Wallet, Plane, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FelitzBankMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isActive = pathname.startsWith('/felitz') || pathname.startsWith('/ma-compagnie') || pathname.startsWith('/marketplace') || pathname.startsWith('/inventaire') || pathname.startsWith('/depot-plan-vol') || pathname.startsWith('/plans-vol');

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-slate-700/50 text-sky-300'
            : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
        )}
      >
        <Building2 className="h-4 w-4" />
        Felitz Bank
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-slate-700 bg-slate-800 shadow-lg z-50">
          <div className="py-1">
            <Link
              href="/felitz/compte-personnel"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
            >
              <Wallet className="h-4 w-4" />
              Compte personnel
            </Link>
            <Link
              href="/felitz/compte-pdg"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
            >
              <Building2 className="h-4 w-4" />
              Compte PDG
            </Link>
            <Link
              href="/ma-compagnie"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
            >
              <Users className="h-4 w-4" />
              Ma compagnie
            </Link>
            <Link
              href="/marketplace"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
            >
              <Plane className="h-4 w-4" />
              Marketplace
            </Link>
            <Link
              href="/inventaire"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
            >
              <Plane className="h-4 w-4" />
              Mon inventaire
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
