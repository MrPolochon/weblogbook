'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, LayoutDashboard, FileText, User, LogOut, Radio, Shield, ScrollText, ChevronDown, Plane, Building2, Landmark, Package, Mail, Map } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface NavBarProps {
  isAdmin: boolean;
  isArmee?: boolean;
  isPdg?: boolean;
  hasCompagnie?: boolean;
  pendingVolsCount?: number;
  volsAConfirmerCount?: number;
  messagesNonLusCount?: number;
}

export default function NavBar({ isAdmin, isArmee = false, isPdg = false, hasCompagnie = false, pendingVolsCount = 0, volsAConfirmerCount = 0, messagesNonLusCount = 0 }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [piloteMenuOpen, setPiloteMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setPiloteMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const piloteMenuItems = [
    { href: '/logbook', label: 'Mon logbook', icon: BookOpen, badge: 0 },
    { href: '/logbook/depot-plan-vol', label: 'Déposer un plan de vol', icon: Plane, badge: 0 },
    { href: '/logbook/plans-vol', label: 'Mes plans de vol', icon: FileText, badge: 0 },
    { href: '/marche-passagers', label: 'Marché passagers', icon: Map, badge: 0 },
    { href: '/marche-cargo', label: 'Marché cargo', icon: Package, badge: 0 },
    { href: '/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount },
    ...(hasCompagnie ? [{ href: '/ma-compagnie', label: 'Ma compagnie', icon: Building2, badge: 0 }] : []),
    ...(isArmee || isAdmin ? [{ href: '/militaire', label: 'Espace militaire', icon: Shield, badge: 0 }] : []),
    { href: '/felitz-bank', label: 'Felitz Bank', icon: Landmark, badge: 0 },
    { href: '/marketplace', label: 'Marketplace', icon: Package, badge: 0 },
    { href: '/inventaire', label: 'Mon inventaire', icon: Plane, badge: 0 },
  ];

  const isPiloteActive = pathname.startsWith('/logbook') || pathname.startsWith('/militaire') || 
    pathname.startsWith('/felitz-bank') || pathname.startsWith('/ma-compagnie') ||
    pathname.startsWith('/marketplace') || pathname.startsWith('/inventaire') ||
    pathname.startsWith('/messagerie') || pathname.startsWith('/marche-passagers') ||
    pathname.startsWith('/marche-cargo');

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <nav className="flex items-center gap-1">
          {/* Menu déroulant Espace Pilote */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setPiloteMenuOpen(!piloteMenuOpen)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
                isPiloteActive
                  ? 'bg-slate-700/50 text-sky-300'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
              )}
            >
              <Plane className="h-4 w-4" />
              Espace Pilote
              <ChevronDown className={cn('h-4 w-4 transition-transform', piloteMenuOpen && 'rotate-180')} />
              {volsAConfirmerCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-slate-900"
                  title={`${volsAConfirmerCount} vol(s) à confirmer`}
                >
                  {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
                </span>
              )}
            </button>
            
            {piloteMenuOpen && (
              <div className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl z-50">
                {piloteMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setPiloteMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                        pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href))
                          ? 'bg-slate-700/50 text-sky-300'
                          : 'text-slate-300 hover:bg-slate-700/30 hover:text-slate-100'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                      {item.badge > 0 && (
                        <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {volsAConfirmerCount > 0 && (
            <Link
              href="/logbook/a-confirmer"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors bg-red-900/40 text-red-300 hover:bg-red-900/60',
                pathname === '/logbook/a-confirmer' ? 'ring-1 ring-red-500' : ''
              )}
            >
              À confirmer
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
              </span>
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
                pathname.startsWith('/admin')
                  ? 'bg-slate-700/50 text-sky-300'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin
              {pendingVolsCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-slate-900"
                  title={`${pendingVolsCount} vol(s) en attente`}
                >
                  {pendingVolsCount > 99 ? '99+' : pendingVolsCount}
                </span>
              )}
            </Link>
          )}
          <Link
            href="/documents"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/documents')
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <FileText className="h-4 w-4" />
            Documents
          </Link>
          <Link
            href="/notams"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/notams')
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <ScrollText className="h-4 w-4" />
            NOTAMs
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/atc"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
              title="Passer à l'espace ATC"
            >
              <Radio className="h-4 w-4" />
              Espace ATC
            </Link>
          )}
          <Link
            href="/compte"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === '/compte'
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <User className="h-4 w-4" />
            Mon compte
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
