'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen, BookUser, LayoutDashboard, FileText, User, Users, LogOut, Radio, Shield,
  ScrollText, ChevronDown, Plane, Building2, Landmark, Package, Mail, Map,
  Store, AlertTriangle, Flame, Gauge, Wrench, Eye, Trophy, Menu, X,
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

  // Dropdown Pilote (desktop)
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  // Drawer mobile
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Ferme le dropdown Pilote si on clique hors
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

  // Ferme le drawer mobile au changement de route
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Bloque le scroll du body quand le drawer mobile est ouvert
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mobileOpen]);

  // Recalcule la position du dropdown Pilote
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
    { href: '/classement', label: 'Classement', icon: Trophy, badge: 0 },
  ];

  const isPiloteActive = [
    '/logbook', '/militaire', '/felitz-bank', '/ma-compagnie', '/marketplace',
    '/hangar-market', '/inventaire', '/messagerie', '/marche-passagers',
    '/marche-cargo', '/perf-ptfs', '/alliance', '/signalement', '/reparation',
    '/documents', '/notams', '/classement',
  ].some(p => pathname.startsWith(p));

  const totalAdminBadge = pendingVolsCount + adminPlansEnAttenteCount + adminPasswordResetCount + adminAeroschoolCount;

  // Badge total affiché sur le hamburger mobile
  const totalMobileBadge =
    volsAConfirmerCount
    + messagesNonLusCount + invitationsCount
    + allianceInvitationsCount
    + (isAdmin ? totalAdminBadge : 0)
    + ((isIfsa || isAdmin) ? signalementsNouveauxCount : 0);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-700/50 bg-[#0b0e1a]"
        style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.7)' }}
      >
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-2 px-3 sm:px-4">

          {/* ══════════════════════════════════════════════════════════════ */}
          {/*  MOBILE : bouton hamburger                                      */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="md:hidden relative flex items-center gap-2 rounded-lg border border-slate-700/50 px-3 py-2 text-sm font-semibold text-slate-200 hover:border-sky-500/50 hover:bg-sky-500/10 transition-colors shrink-0"
          >
            <Menu className="h-4 w-4" />
            <span>Menu</span>
            {totalMobileBadge > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ring-2 ring-[#0b0e1a]">
                {totalMobileBadge > 99 ? '99+' : totalMobileBadge}
              </span>
            )}
          </button>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/*  DESKTOP : Navigation principale (md+)                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <nav className="hidden md:flex items-center gap-1.5 min-w-0">

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
                <span className="hidden lg:inline">Espace Pilote</span>
                <span className="lg:hidden">Pilote</span>
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

            <span className="mx-0.5 h-5 w-px bg-slate-700/70 shrink-0" />

            <NavLink href="/instruction" active={pathname.startsWith('/instruction')}>
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">Instruction</span>
            </NavLink>

            <NavLink href="/annuaire" active={pathname.startsWith('/annuaire')}>
              <BookUser className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">Annuaire</span>
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

          {/* ══════════════════════════════════════════════════════════════ */}
          {/*  DESKTOP : Section droite (md+)                                 */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <span className="mr-0.5 h-5 w-px bg-slate-700/70" />

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

            <span className="mx-0.5 h-5 w-px bg-slate-700/70" />

            <NavLink href="/compte" active={pathname === '/compte'} title="Mon compte">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">Mon compte</span>
            </NavLink>

            <button
              type="button"
              onClick={handleLogout}
              title="Se déconnecter"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold border border-slate-700/50 text-slate-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">Déconnexion</span>
            </button>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/*  MOBILE : Section droite (compte + déconnexion en icônes)       */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="flex md:hidden items-center gap-1.5 shrink-0">
            <Link
              href="/compte"
              title="Mon compte"
              className={cn(
                'flex items-center justify-center h-9 w-9 rounded-lg border transition-colors',
                pathname === '/compte'
                  ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                  : 'border-slate-700/50 text-slate-300 hover:border-slate-500/50 hover:bg-slate-800 hover:text-white',
              )}
            >
              <User className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Se déconnecter"
              aria-label="Se déconnecter"
              className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-700/50 text-slate-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  Dropdown Pilote (desktop) — portail                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {mounted && menuOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="w-56 max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-2xl border border-slate-600/60 bg-[#0d1120] py-2 shadow-2xl scrollbar-hide"
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  Drawer MOBILE : menu plein écran                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {mounted && mobileOpen && createPortal(
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Panel */}
          <div className="absolute inset-y-0 left-0 w-[85vw] max-w-sm bg-[#0b0e1a] border-r border-slate-700/50 shadow-2xl flex flex-col">
            {/* Header du drawer */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
              <span className="text-sm font-semibold text-slate-200">Navigation</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer"
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-700/50 text-slate-400 hover:border-slate-500/50 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto py-2">
              {/* À confirmer — bandeau rouge en haut si nécessaire */}
              {volsAConfirmerCount > 0 && (
                <Link
                  href="/logbook/a-confirmer"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'mx-2 mb-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold border transition-colors',
                    pathname === '/logbook/a-confirmer'
                      ? 'border-red-500/50 bg-red-500/20 text-red-200'
                      : 'border-red-500/30 bg-red-500/10 text-red-300',
                  )}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Vols à confirmer</span>
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                    {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
                  </span>
                </Link>
              )}

              {/* Section Pilote */}
              <MobileSectionLabel>Espace pilote</MobileSectionLabel>
              {piloteMenuItems.map((item) => (
                <MobileItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  badge={item.badge}
                  active={pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href))}
                  onClick={() => setMobileOpen(false)}
                />
              ))}

              {/* Instruction */}
              <MobileSectionLabel>Instruction</MobileSectionLabel>
              <MobileItem
                href="/instruction"
                icon={Users}
                label="Instruction"
                active={pathname.startsWith('/instruction')}
                onClick={() => setMobileOpen(false)}
              />
              <MobileItem
                href="/annuaire"
                icon={BookUser}
                label="Annuaire"
                active={pathname.startsWith('/annuaire')}
                onClick={() => setMobileOpen(false)}
              />

              {/* Admin */}
              {isAdmin && (
                <>
                  <MobileSectionLabel>Administration</MobileSectionLabel>
                  <MobileItem
                    href="/admin"
                    icon={LayoutDashboard}
                    label="Admin"
                    badge={totalAdminBadge}
                    active={pathname.startsWith('/admin')}
                    accent="purple"
                    onClick={() => setMobileOpen(false)}
                  />
                </>
              )}

              {/* IFSA */}
              {(isIfsa || isAdmin) && (
                <MobileItem
                  href="/ifsa"
                  icon={Shield}
                  label="IFSA"
                  badge={signalementsNouveauxCount}
                  active={pathname.startsWith('/ifsa')}
                  accent="indigo"
                  onClick={() => setMobileOpen(false)}
                />
              )}

              {/* ODW — carte œil du web */}
              <MobileItem
                href="/carte-atc"
                icon={Eye}
                label="Carte œil du web"
                active={pathname === '/carte-atc'}
                accent="emerald"
                onClick={() => setMobileOpen(false)}
              />

              {/* Espaces ATC & SIAVI (admin seulement) */}
              {isAdmin && (
                <>
                  <MobileSectionLabel>Autres espaces</MobileSectionLabel>
                  <MobileItem
                    href="/atc"
                    icon={Radio}
                    label="Espace ATC"
                    active={pathname.startsWith('/atc')}
                    accent="emerald"
                    onClick={() => setMobileOpen(false)}
                  />
                  <MobileItem
                    href="/siavi"
                    icon={Flame}
                    label="Espace SIAVI"
                    active={pathname.startsWith('/siavi')}
                    accent="red"
                    onClick={() => setMobileOpen(false)}
                  />
                </>
              )}

              {/* Compte */}
              <MobileSectionLabel>Compte</MobileSectionLabel>
              <MobileItem
                href="/compte"
                icon={User}
                label="Mon compte"
                active={pathname === '/compte'}
                onClick={() => setMobileOpen(false)}
              />
              <button
                type="button"
                onClick={() => { setMobileOpen(false); handleLogout(); }}
                className="w-full mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                style={{ width: 'calc(100% - 1rem)' }}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Helper composants mobile ─────────────────────────────────────────── */

function MobileSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
      {children}
    </div>
  );
}

function MobileItem({
  href, icon: Icon, label, badge = 0, active, accent = 'default', onClick,
}: {
  href: string;
  icon: typeof BookOpen;
  label: string;
  badge?: number;
  active: boolean;
  accent?: keyof typeof ACCENT;
  onClick?: () => void;
}) {
  const accentClasses = active ? ACCENT[accent].active : 'text-slate-300 hover:bg-slate-800 hover:text-white border-transparent';
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium border transition-colors',
        accentClasses,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
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
