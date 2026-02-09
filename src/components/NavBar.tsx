'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, LayoutDashboard, FileText, User, LogOut, Radio, Shield, ScrollText, ChevronDown, Plane, Building2, Landmark, Package, Mail, Map, Store, AlertTriangle, Flame } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface NavBarProps {
  isAdmin: boolean;
  isArmee?: boolean;
  isPdg?: boolean;
  hasCompagnie?: boolean;
  isIfsa?: boolean;
  pendingVolsCount?: number;
  volsAConfirmerCount?: number;
  messagesNonLusCount?: number;
  invitationsCount?: number;
  signalementsNouveauxCount?: number;
}

export default function NavBar({ isAdmin, isArmee = false, isPdg = false, hasCompagnie = false, isIfsa = false, pendingVolsCount = 0, volsAConfirmerCount = 0, messagesNonLusCount = 0, invitationsCount = 0, signalementsNouveauxCount = 0 }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [piloteMenuOpen, setPiloteMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const targetNode = event.target as Node | null;
      const containsTarget = menuRef.current ? !!targetNode && menuRef.current.contains(targetNode) : false;
      if (menuRef.current && !containsTarget) {
        setPiloteMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function updateDropdownPosition() {
      if (!piloteMenuOpen || !triggerRef.current) {
        setDropdownStyle(null);
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const top = Math.round(rect.bottom + 4);
      const left = Math.round(rect.left);
      setDropdownStyle({ position: 'fixed', top, left, zIndex: 70 });
    }
    updateDropdownPosition();
    if (!piloteMenuOpen) return;
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [piloteMenuOpen]);

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
    { href: '/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount + invitationsCount },
    ...(hasCompagnie ? [{ href: '/ma-compagnie', label: 'Ma compagnie', icon: Building2, badge: 0 }] : []),
    ...(isArmee || isAdmin ? [{ href: '/militaire', label: 'Espace militaire', icon: Shield, badge: 0 }] : []),
    { href: '/felitz-bank', label: 'Felitz Bank', icon: Landmark, badge: 0 },
    { href: '/marketplace', label: 'Marketplace', icon: Package, badge: 0 },
    { href: '/hangar-market', label: 'Hangar Market', icon: Store, badge: 0 },
    { href: '/inventaire', label: 'Mon inventaire', icon: Plane, badge: 0 },
    { href: '/signalement', label: 'Signalement IFSA', icon: AlertTriangle, badge: 0 },
  ];

  const isPiloteActive = pathname.startsWith('/logbook') || pathname.startsWith('/militaire') || 
    pathname.startsWith('/felitz-bank') || pathname.startsWith('/ma-compagnie') ||
    pathname.startsWith('/marketplace') || pathname.startsWith('/hangar-market') ||
    pathname.startsWith('/inventaire') || pathname.startsWith('/messagerie') || 
    pathname.startsWith('/marche-passagers') || pathname.startsWith('/marche-cargo') ||
    pathname.startsWith('/signalement');

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/30 bg-slate-900/80 backdrop-blur-xl shadow-lg shadow-slate-900/50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2 sm:h-16 sm:py-0 flex-col sm:flex-row gap-2">
        <nav className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto overflow-y-visible sm:overflow-visible whitespace-nowrap scrollbar-hide">
          {/* Menu déroulant Espace Pilote */}
          <div className="relative" ref={menuRef}>
            <button
              ref={triggerRef}
              onPointerDown={() => {
                setPiloteMenuOpen((prev) => !prev);
              }}
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
              <div style={dropdownStyle ?? undefined} className="fixed w-60 rounded-2xl border border-slate-700/50 bg-slate-800/95 backdrop-blur-xl py-2 shadow-2xl shadow-slate-900/50 z-50 animate-fade-in">
                {piloteMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setPiloteMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-200 mx-2 rounded-xl',
                        isActive
                          ? 'bg-gradient-to-r from-sky-600/30 to-sky-500/20 text-sky-300 shadow-sm'
                          : 'text-slate-300 hover:bg-slate-700/40 hover:text-slate-100 hover:translate-x-1'
                      )}
                    >
                      <Icon className={cn("h-4 w-4 transition-colors", isActive && "text-sky-400")} />
                      {item.label}
                      {item.badge > 0 && (
                        <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-to-r from-red-600 to-red-500 px-1.5 text-xs font-bold text-white shadow-lg shadow-red-500/30">
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
          {(isIfsa || isAdmin) && (
            <Link
              href="/ifsa"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
                pathname.startsWith('/ifsa')
                  ? 'bg-indigo-700/50 text-indigo-300'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
              )}
            >
              <Shield className="h-4 w-4" />
              IFSA
              {signalementsNouveauxCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-600 px-1.5 text-xs font-bold text-white ring-2 ring-slate-900"
                  title={`${signalementsNouveauxCount} signalement(s) nouveau(x)`}
                >
                  {signalementsNouveauxCount > 99 ? '99+' : signalementsNouveauxCount}
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
        <div className="w-full sm:w-auto">
          <div className="hidden sm:flex items-center gap-2 justify-end flex-wrap">
            {isAdmin && (
              <>
                <Link
                  href="/atc"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
                  title="Passer à l'espace ATC"
                >
                  <Radio className="h-4 w-4" />
                  Espace ATC
                </Link>
                <Link
                  href="/siavi"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-red-800/50 hover:text-red-200"
                  title="Passer à l'espace SIAVI"
                >
                  <Flame className="h-4 w-4" />
                  Espace SIAVI
                </Link>
              </>
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

          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              className="w-full flex items-center justify-center rounded-lg px-3 py-2 bg-slate-800/50 text-slate-300 border border-slate-700/50"
              aria-label="Ouvrir le menu compte"
            >
              <ChevronDown className={cn('h-5 w-5 transition-transform', accountMenuOpen && 'rotate-180')} />
            </button>

            {accountMenuOpen && (
              <div className="mt-2 grid gap-2">
                {isAdmin && (
                  <>
                    <Link
                      href="/atc"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800"
                      title="Passer à l'espace ATC"
                    >
                      <Radio className="h-4 w-4" />
                      Espace ATC
                    </Link>
                    <Link
                      href="/siavi"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 bg-red-900/50 hover:bg-red-800"
                      title="Passer à l'espace SIAVI"
                    >
                      <Flame className="h-4 w-4" />
                      Espace SIAVI
                    </Link>
                  </>
                )}
                <Link
                  href="/compte"
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    pathname === '/compte'
                      ? 'bg-slate-700/50 text-sky-300'
                      : 'text-slate-300 bg-slate-800/50 hover:bg-slate-800'
                  )}
                >
                  <User className="h-4 w-4" />
                  Mon compte
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 hover:text-red-300"
                >
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
