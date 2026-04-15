'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen, LayoutDashboard, FileText, User, Users, LogOut, Radio, Shield,
  ScrollText, ChevronDown, Plane, Building2, Landmark, Package, Mail, Map,
  Store, AlertTriangle, Flame, Gauge, Wrench, Eye,
} from 'lucide-react';
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

export default function NavBar({
  isAdmin, isArmee = false, isPdg = false,
  hasCompagnie = false, isIfsa = false, isReparateur = false,
  pendingVolsCount = 0, adminPlansEnAttenteCount = 0, adminPasswordResetCount = 0,
  adminAeroschoolCount = 0, volsAConfirmerCount = 0, messagesNonLusCount = 0,
  invitationsCount = 0, signalementsNouveauxCount = 0, allianceInvitationsCount = 0,
}: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Ferme le menu si on clique hors du bouton ET hors du dropdown
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      const inTrigger = triggerRef.current?.contains(t);
      const inDropdown = dropdownRef.current?.contains(t);
      if (!inTrigger && !inDropdown) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Recalcule la position si la fenêtre change pendant que le menu est ouvert
  useEffect(() => {
    if (!menuOpen) return;
    function reposition() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: r.bottom + 6, left: r.left });
    }
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [menuOpen]);

  function openMenu() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // Position calculée AVANT le setState pour éviter le flash au premier rendu
    setDropdownPos({ top: r.bottom + 6, left: r.left });
    setMenuOpen(true);
  }

  function toggleMenu() {
    if (menuOpen) { setMenuOpen(false); } else { openMenu(); }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    startTransition(() => router.refresh());
  }

  const piloteMenuItems: Array<{
    href: string; label: string; icon: typeof BookOpen;
    badge: number; separator?: boolean;
  }> = [
    { href: '/logbook', label: 'Mon logbook', icon: BookOpen, badge: 0 },
    { href: '/logbook/depot-plan-vol', label: 'Déposer un plan de vol', icon: Plane, badge: 0 },
    { href: '/logbook/plans-vol', label: 'Mes plans de vol', icon: FileText, badge: 0 },
    { href: '/marche-passagers', label: 'Marché passagers', icon: Map, badge: 0, separator: true },
    { href: '/marche-cargo', label: 'Marché cargo', icon: Package, badge: 0 },
    { href: '/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount + invitationsCount, separator: true },
    ...(hasCompagnie ? [
      { href: '/ma-compagnie', label: 'Ma compagnie', icon: Building2, badge: 0 },
      { href: '/alliance', label: 'Alliance', icon: Users, badge: allianceInvitationsCount },
    ] : []),
    ...(isArmee || isAdmin ? [{ href: '/militaire', label: 'Espace militaire', icon: Shield, badge: 0 }] : []),
    { href: '/felitz-bank', label: 'Felitz Bank', icon: Landmark, badge: 0, separator: true },
    { href: '/marketplace', label: 'Marketplace', icon: Package, badge: 0 },
    { href: '/hangar-market', label: 'Hangar Market', icon: Store, badge: 0 },
    ...(isReparateur || isPdg ? [{ href: '/reparation', label: 'Réparation', icon: Wrench, badge: 0 }] : []),
    { href: '/inventaire', label: 'Mon inventaire', icon: Plane, badge: 0 },
    { href: '/perf-ptfs', label: 'Calculateur perf PTFS', icon: Gauge, badge: 0 },
    { href: '/documents', label: 'Documents', icon: FileText, badge: 0, separator: true },
    { href: '/notams', label: 'NOTAMs', icon: ScrollText, badge: 0 },
    { href: '/signalement', label: 'Signalement IFSA', icon: AlertTriangle, badge: 0, separator: true },
  ];

  const isPiloteActive = [
    '/logbook', '/militaire', '/felitz-bank', '/ma-compagnie', '/marketplace',
    '/hangar-market', '/inventaire', '/messagerie', '/marche-passagers',
    '/marche-cargo', '/perf-ptfs', '/alliance', '/signalement', '/reparation',
    '/documents', '/notams',
  ].some(p => pathname.startsWith(p));

  const totalAdminBadge = pendingVolsCount + adminPlansEnAttenteCount + adminPasswordResetCount + adminAeroschoolCount;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-700/50 bg-[#0b0e1a]"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.7)' }}
      >
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-3 px-4">

          {/* ── Navigation principale ──────────────────────────────────── */}
          <nav className="flex items-center gap-1.5 min-w-0">

            {/* Espace Pilote dropdown trigger */}
            <div className="relative shrink-0">
              <button
                ref={triggerRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                onClick={toggleMenu}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors select-none border',
                  isPiloteActive || menuOpen
                    ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                    : 'border-slate-700/50 text-slate-300 hover:border-slate-500/50 hover:bg-slate-800 hover:text-white',
                )}
              >
                <Plane className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden md:inline">Espace Pilote</span>
                <span className="md:hidden">Pilote</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 shrink-0', menuOpen && 'rotate-180')} />
                {volsAConfirmerCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ring-2 ring-[#0b0e1a]">
                    {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
                  </span>
                )}
              </button>
            </div>

            {/* Badge vols à confirmer */}
            {volsAConfirmerCount > 0 && (
              <Link
                href="/logbook/a-confirmer"
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors shrink-0',
                  pathname === '/logbook/a-confirmer'
                    ? 'border-red-500/50 bg-red-500/20 text-red-200'
                    : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200',
                )}
              >
                À confirmer
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
                </span>
              </Link>
            )}

            <span className="mx-0.5 h-5 w-px bg-slate-700/70 shrink-0 hidden sm:block" />

            <NavLink href="/instruction" active={pathname.startsWith('/instruction')}>
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">Instruction</span>
            </NavLink>

            {isAdmin && (
              <NavLink href="/admin" active={pathname.startsWith('/admin')} accent="purple">
                <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
                Admin
                {totalAdminBadge > 0 && (
                  <span className="ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {totalAdminBadge > 99 ? '99+' : totalAdminBadge}
                  </span>
                )}
              </NavLink>
            )}

            {(isIfsa || isAdmin) && (
              <NavLink href="/ifsa" active={pathname.startsWith('/ifsa')} accent="indigo">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                IFSA
                {signalementsNouveauxCount > 0 && (
                  <span className="ml-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                    {signalementsNouveauxCount > 99 ? '99+' : signalementsNouveauxCount}
                  </span>
                )}
              </NavLink>
            )}

            <NavLink href="/carte-atc" active={pathname === '/carte-atc'} accent="emerald" title="Carte œil du web">
              <Eye className="h-3.5 w-3.5 shrink-0" />
              ODW
            </NavLink>
          </nav>

          {/* ── Section droite ──────────────────────────────────────────── */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="mr-0.5 h-5 w-px bg-slate-700/70 hidden sm:block" />

            {isAdmin && (
              <>
                <NavLink href="/atc" active={pathname.startsWith('/atc')} accent="emerald" title="Espace ATC">
                  <Radio className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden lg:inline">Espace ATC</span>
                  <span className="lg:hidden">ATC</span>
                </NavLink>
                <NavLink href="/siavi" active={pathname.startsWith('/siavi')} accent="red" title="Espace SIAVI">
                  <Flame className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden lg:inline">Espace SIAVI</span>
                  <span className="lg:hidden">SIAVI</span>
                </NavLink>
              </>
            )}

            <span className="mx-0.5 h-5 w-px bg-slate-700/70 hidden sm:block" />

            <NavLink href="/compte" active={pathname === '/compte'} title="Mon compte">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Mon compte</span>
            </NavLink>

            <button
              type="button"
              onClick={handleLogout}
              title="Se déconnecter"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold border border-slate-700/50 text-slate-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Dropdown portail (hors header, aucun clipping) ──────────────── */}
      {mounted && menuOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="w-56 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl border border-slate-600/60 bg-[#0d1120] py-2 shadow-2xl scrollbar-hide"
        >
          {piloteMenuItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href));
            return (
              <div key={item.href}>
                {item.separator && idx > 0 && (
                  <div className="mx-3 my-1.5 border-t border-slate-700/50" />
                )}
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 mx-1.5 px-2.5 py-1.5 text-[13px] rounded-lg transition-colors',
                    isActive
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-700/60 hover:text-white border border-transparent',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-sky-400' : 'text-slate-500')} />
                  <span className="truncate">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── NavLink ───────────────────────────────────────────────────────────── */
const ACCENT = {
  default: {
    inactive: 'border-slate-700/50 text-slate-300 hover:border-slate-500/50 hover:bg-slate-800 hover:text-white',
    active:   'border-sky-500/50 bg-sky-500/20 text-sky-200',
  },
  purple: {
    inactive: 'border-slate-700/50 text-slate-300 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-200',
    active:   'border-purple-500/50 bg-purple-500/20 text-purple-200',
  },
  indigo: {
    inactive: 'border-slate-700/50 text-slate-300 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-indigo-200',
    active:   'border-indigo-500/50 bg-indigo-500/20 text-indigo-200',
  },
  emerald: {
    inactive: 'border-slate-700/50 text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200',
    active:   'border-emerald-500/50 bg-emerald-500/20 text-emerald-200',
  },
  red: {
    inactive: 'border-slate-700/50 text-slate-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200',
    active:   'border-red-500/50 bg-red-500/20 text-red-200',
  },
} as const;

function NavLink({
  href, active, accent = 'default', title, children,
}: {
  href: string; active: boolean; accent?: keyof typeof ACCENT; title?: string; children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors whitespace-nowrap shrink-0',
        active ? ACCENT[accent].active : ACCENT[accent].inactive,
      )}
    >
      {children}
    </Link>
  );
}
