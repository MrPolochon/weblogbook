'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, LayoutDashboard, FileText, User, Users, LogOut, Radio, Shield, ScrollText, ChevronDown, Plane, Building2, Landmark, Package, Mail, Map, Store, AlertTriangle, Flame, Gauge, Wrench } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface NavBarProps {
  isAdmin: boolean;
  isInstructeur?: boolean;
  isArmee?: boolean;
  isPdg?: boolean;
  hasCompagnie?: boolean;
  isIfsa?: boolean;
  isReparateur?: boolean;
  pendingVolsCount?: number;
  adminPlansEnAttenteCount?: number;
  adminPasswordResetCount?: number;
  adminAeroschoolCount?: number;
  volsAConfirmerCount?: number;
  messagesNonLusCount?: number;
  invitationsCount?: number;
  signalementsNouveauxCount?: number;
  allianceInvitationsCount?: number;
}

export default function NavBar({ isAdmin, isInstructeur = false, isArmee = false, isPdg = false, hasCompagnie = false, isIfsa = false, isReparateur = false, pendingVolsCount = 0, adminPlansEnAttenteCount = 0, adminPasswordResetCount = 0, adminAeroschoolCount = 0, volsAConfirmerCount = 0, messagesNonLusCount = 0, invitationsCount = 0, signalementsNouveauxCount = 0, allianceInvitationsCount = 0 }: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [piloteMenuOpen, setPiloteMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const targetNode = event.target as Node | null;
      if (menuRef.current && targetNode && !menuRef.current.contains(targetNode)) {
        setPiloteMenuOpen(false);
      }
      if (accountMenuRef.current && targetNode && !accountMenuRef.current.contains(targetNode)) {
        setAccountMenuOpen(false);
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
    startTransition(() => router.refresh());
  }

  const piloteMenuItems: Array<{ href: string; label: string; icon: typeof BookOpen; badge: number; separator?: boolean }> = [
    { href: '/logbook', label: 'Mon logbook', icon: BookOpen, badge: 0 },
    ...(isInstructeur || isAdmin ? [{ href: '/instruction', label: 'Instruction', icon: Users, badge: 0 }] : []),
    { href: '/logbook/depot-plan-vol', label: 'Déposer un plan de vol', icon: Plane, badge: 0 },
    { href: '/logbook/plans-vol', label: 'Mes plans de vol', icon: FileText, badge: 0 },
    { href: '/marche-passagers', label: 'Marché passagers', icon: Map, badge: 0, separator: true },
    { href: '/marche-cargo', label: 'Marché cargo', icon: Package, badge: 0 },
    { href: '/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount + invitationsCount, separator: true },
    ...(hasCompagnie ? [{ href: '/ma-compagnie', label: 'Ma compagnie', icon: Building2, badge: 0 }, { href: '/alliance', label: 'Alliance', icon: Users, badge: allianceInvitationsCount }] : []),
    ...(isArmee || isAdmin ? [{ href: '/militaire', label: 'Espace militaire', icon: Shield, badge: 0 }] : []),
    { href: '/felitz-bank', label: 'Felitz Bank', icon: Landmark, badge: 0, separator: true },
    { href: '/marketplace', label: 'Marketplace', icon: Package, badge: 0 },
    { href: '/hangar-market', label: 'Hangar Market', icon: Store, badge: 0 },
    ...(isReparateur || isPdg ? [{ href: '/reparation', label: 'Réparation', icon: Wrench, badge: 0 }] : []),
    { href: '/inventaire', label: 'Mon inventaire', icon: Plane, badge: 0 },
    { href: '/perf-ptfs', label: 'Calculateur perf PTFS', icon: Gauge, badge: 0 },
    { href: '/signalement', label: 'Signalement IFSA', icon: AlertTriangle, badge: 0, separator: true },
  ];

  const isPiloteActive = pathname.startsWith('/logbook') || pathname.startsWith('/militaire') || 
    pathname.startsWith('/felitz-bank') || pathname.startsWith('/ma-compagnie') ||
    pathname.startsWith('/marketplace') || pathname.startsWith('/hangar-market') ||
    pathname.startsWith('/inventaire') || pathname.startsWith('/messagerie') || 
    pathname.startsWith('/marche-passagers') || pathname.startsWith('/marche-cargo') ||
    pathname.startsWith('/perf-ptfs') || pathname.startsWith('/alliance') || pathname.startsWith('/signalement') || pathname.startsWith('/reparation') ||
    pathname.startsWith('/instruction');

  const totalAdminBadge = pendingVolsCount + adminPlansEnAttenteCount + adminPasswordResetCount + adminAeroschoolCount;
  const navItemBase = 'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold tracking-[0.01em] transition-all whitespace-nowrap shrink-0 border';
  const navItemMuted = 'border-slate-700/30 text-slate-200 hover:border-slate-500/35 hover:bg-slate-700/45 hover:text-white';
  const navItemActive = 'border-sky-500/35 bg-sky-500/18 text-sky-200 shadow-[0_10px_22px_rgba(2,132,199,0.22)]';

  function renderInlineBadge(count: number, color: 'red' | 'orange' = 'red') {
    if (count <= 0) return null;
    const badgeClass = color === 'orange' ? 'bg-orange-600' : 'bg-red-600';
    return (
      <span className={`ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${badgeClass}`}>
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-600/30 bg-slate-950/82 backdrop-blur-2xl shadow-[0_18px_34px_rgba(2,6,23,0.45)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-2 px-4 py-2 sm:h-16 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between sm:gap-4 sm:py-0">
        <nav className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-visible whitespace-nowrap scrollbar-hide">
          {/* Menu déroulant Espace Pilote */}
          <div className="relative" ref={menuRef}>
            <button
              ref={triggerRef}
              aria-label="Ouvrir le menu Espace Pilote"
              aria-expanded={piloteMenuOpen}
              onPointerDown={() => {
                setPiloteMenuOpen((prev) => !prev);
              }}
              className={cn(
                `${navItemBase} relative`,
                isPiloteActive
                  ? navItemActive
                  : navItemMuted
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
              <div style={dropdownStyle ?? undefined} className="fixed w-64 rounded-2xl border border-slate-600/50 bg-slate-950 py-1.5 shadow-[0_24px_56px_rgba(2,6,23,0.75)] z-50 animate-fade-in">
                {piloteMenuItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href));
                  return (
                    <div key={item.href}>
                      {item.separator && idx > 0 && (
                        <div className="mx-4 my-1 border-t border-slate-700/40" />
                      )}
                      <Link
                        href={item.href}
                        onClick={() => setPiloteMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 mx-1.5 rounded-lg',
                          isActive
                            ? 'border border-sky-500/35 bg-sky-500/20 text-sky-100'
                            : 'border border-transparent text-slate-200 hover:border-slate-500/40 hover:bg-slate-800 hover:text-white'
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-sky-400" : "text-slate-500")} />
                        <span className="truncate">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {volsAConfirmerCount > 0 && (
            <Link
              href="/logbook/a-confirmer"
              className={cn(
                `${navItemBase} bg-red-900/40 text-red-300 hover:bg-red-900/60`,
              pathname === '/logbook/a-confirmer' ? 'ring-1 ring-red-400/80' : ''
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
                navItemBase,
                pathname.startsWith('/admin')
                  ? navItemActive
                  : navItemMuted
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin
              <span
                title={[
                  pendingVolsCount > 0 && `${pendingVolsCount} vol(s) en attente`,
                  adminPlansEnAttenteCount > 0 && `${adminPlansEnAttenteCount} plan(s) en attente`,
                  adminPasswordResetCount > 0 && `${adminPasswordResetCount} demande(s) MDP`,
                  adminAeroschoolCount > 0 && `${adminAeroschoolCount} AeroSchool`,
                ].filter(Boolean).join(' · ')}
              >
                {renderInlineBadge(totalAdminBadge)}
              </span>
            </Link>
          )}
          {(isIfsa || isAdmin) && (
            <Link
              href="/ifsa"
              className={cn(
                navItemBase,
                pathname.startsWith('/ifsa')
                  ? 'bg-indigo-700/50 text-indigo-300'
                  : navItemMuted
              )}
            >
              <Shield className="h-4 w-4" />
              IFSA
              <span title={`${signalementsNouveauxCount} signalement(s) nouveau(x)`}>
                {renderInlineBadge(signalementsNouveauxCount, 'orange')}
              </span>
            </Link>
          )}
          <Link
            href="/documents"
            className={cn(
              navItemBase,
              pathname.startsWith('/documents')
                ? navItemActive
                : navItemMuted
            )}
          >
            <FileText className="h-4 w-4" />
            Documents
          </Link>
          <Link
            href="/notams"
            className={cn(
              navItemBase,
              pathname.startsWith('/notams')
                ? navItemActive
                : navItemMuted
            )}
          >
            <ScrollText className="h-4 w-4" />
            NOTAMs
          </Link>
          <Link
            href="/carte-atc"
            className={cn(
              `${navItemBase} gap-1.5`,
              pathname === '/carte-atc'
                ? 'bg-slate-700/50 text-emerald-300'
                : 'text-emerald-400/70 hover:bg-emerald-900/20 hover:text-emerald-300'
            )}
            title="Carte ATC en direct"
          >
            <Radio className="h-4 w-4" />
            Carte ATC
          </Link>
        </nav>
        <div className="w-full sm:w-auto sm:shrink-0">
          <div className="hidden sm:flex items-center justify-end gap-2 border-t border-slate-800/70 pt-2 sm:border-t-0 sm:border-l sm:border-slate-800/70 sm:pl-4 sm:pt-0">
            {isAdmin && (
              <>
                <Link
                  href="/atc"
                  className={`${navItemBase} gap-1.5 border-slate-700/35 text-slate-200 hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-200`}
                  title="Passer à l'espace ATC"
                >
                  <Radio className="h-4 w-4" />
                  Espace ATC
                </Link>
                <Link
                  href="/siavi"
                  className={`${navItemBase} gap-1.5 border-slate-700/35 text-slate-200 hover:border-red-500/45 hover:bg-red-500/15 hover:text-red-200`}
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
                navItemBase,
                pathname === '/compte'
                  ? navItemActive
                  : navItemMuted
              )}
            >
              <User className="h-4 w-4" />
              Mon compte
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className={`${navItemBase} text-slate-300 hover:bg-slate-800/50 hover:text-red-400`}
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>

          <div className="sm:hidden" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              className="w-full flex items-center justify-center rounded-lg px-3 py-2 bg-slate-900/70 text-slate-300 border border-slate-600/35"
              aria-label="Ouvrir le menu compte"
            >
              <ChevronDown className={cn('h-5 w-5 transition-transform', accountMenuOpen && 'rotate-180')} />
            </button>

            {accountMenuOpen && (
              <div className="mt-2 grid gap-2">
                <Link
                  href="/carte-atc"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-300 bg-slate-800/50 hover:bg-slate-800"
                >
                  <Radio className="h-4 w-4" />
                  Carte ATC
                </Link>
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
                  aria-label="Se déconnecter"
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
