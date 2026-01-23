'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, BookOpen, FileText, Shield, Wallet, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  isArmee: boolean;
  hasCompagniePDG: boolean;
  hasCompagnie: boolean;
};

export default function PiloteMenu({ isArmee, hasCompagniePDG, hasCompagnie }: Props) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { href: '/logbook', label: 'Mon logbook', icon: BookOpen },
    { href: '/logbook/depot-plan-vol', label: 'Déposer un plan de vol', icon: FileText },
    { href: '/logbook/plans-vol', label: 'Mes plans de vol', icon: FileText },
    ...(isArmee ? [{ href: '/militaire', label: 'Espace militaire', icon: Shield }] : []),
    ...(hasCompagnie ? [{ href: '/compagnie', label: 'Ma compagnie', icon: Building2 }] : []),
    { href: '/felitz-bank/compte-personnel', label: 'Felitz Bank', icon: Wallet },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
        )}
      >
        <Menu className="h-4 w-4" />
        Menu
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[220px] rounded-lg border border-slate-700/50 bg-slate-800 shadow-lg">
            <div className="p-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full',
                      isActive
                        ? 'bg-slate-700/50 text-sky-300'
                        : 'text-slate-300 hover:bg-slate-700/30'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
