'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, ChevronDown, BookOpen, FileText, Shield, LayoutDashboard, ScrollText, Wallet, Radio, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  isAdmin: boolean;
  isArmee: boolean;
  pendingVolsCount: number;
  volsAConfirmerCount: number;
  hasCompagniePDG: boolean;
  hasCompagnie: boolean;
  onLogout: () => void;
};

export default function NavBarMenu({
  isAdmin,
  isArmee,
  pendingVolsCount,
  volsAConfirmerCount,
  hasCompagniePDG,
  hasCompagnie,
  onLogout,
}: Props) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { href: '/logbook', label: 'Mon logbook', icon: BookOpen, badge: volsAConfirmerCount > 0 ? volsAConfirmerCount : undefined },
    ...(volsAConfirmerCount > 0 ? [{ href: '/logbook/a-confirmer', label: 'À confirmer', icon: BookOpen, badge: volsAConfirmerCount }] : []),
    { href: '/logbook/depot-plan-vol', label: 'Déposer un plan de vol', icon: FileText },
    { href: '/logbook/plans-vol', label: 'Mes plans de vol', icon: FileText },
    ...(isArmee || isAdmin ? [{ href: '/militaire', label: 'Espace militaire', icon: Shield }] : []),
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: LayoutDashboard, badge: pendingVolsCount > 0 ? pendingVolsCount : undefined }] : []),
    { href: '/documents', label: 'Documents', icon: FileText },
    { href: '/notams', label: 'NOTAMs', icon: ScrollText },
    ...(hasCompagnie ? [{ href: '/compagnie', label: 'Ma compagnie', icon: LayoutDashboard }] : []),
    ...(isAdmin ? [{ href: '/atc', label: 'Espace ATC', icon: Radio }] : []),
    { href: '/compte', label: 'Mon compte', icon: User },
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
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 min-w-[240px] max-h-[80vh] overflow-y-auto rounded-lg border border-slate-700/50 bg-slate-800 shadow-lg">
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
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full relative',
                      isActive
                        ? 'bg-slate-700/50 text-sky-300'
                        : 'text-slate-300 hover:bg-slate-700/30'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="border-t border-slate-700/50 my-1" />
              <div className="px-1 py-1">
                <div className="text-xs text-slate-400 px-3 py-1 mb-1">Felitz Bank</div>
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
                    <Wallet className="h-4 w-4" />
                    Compte PDG
                  </Link>
                )}
              </div>
              <div className="border-t border-slate-700/50 my-1" />
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors w-full text-slate-300 hover:bg-slate-700/30 hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
