'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
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
  isAdmin, isInstructeur = false, isArmee = false, isPdg = false,
  hasCompagnie = false, isIfsa = false, isReparateur = false,
  pendingVolsCount = 0, adminPlansEnAttenteCount = 0, adminPasswordResetCount = 0,
  adminAeroschoolCount = 0, volsAConfirmerCount = 0, messagesNonLusCount = 0,
  invitationsCount = 0, signalementsNouveauxCount = 0, allianceInvitationsCount = 0,
}: NavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [piloteMenuOpen, setPiloteMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const t = event.target as Node | null;
      if (menuRef.current && t && !menuRef.current.contains(t)) {
        setPiloteMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function updatePos() {
      if (!piloteMenuOpen || !triggerRef.current) { setDropdownStyle(null); return; }
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({ position: 'fixed', top: Math.round(rect.bottom + 6), left: Math.round(rect.left), zIndex: 70 });
    }
    updatePos();
    if (!piloteMenuOpen) return;
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => { window.removeEventListener('resize', updatePos); window.removeEventListener('scroll', updatePos, true); };
  }, [piloteMenuOpen]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    startTransition(() => router.refresh());
  }

  const piloteMenuItems: Array<{
    href: string; label: string; icon: typeof BookOpen;
    badge: number; separator?: boolean; color?: string;
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

  function Badge({ count, color = 'red' }: { count: number; color?: 'red' | 'orange' }) {
    if (count <= 0) return null;
    return (
      <span className={cn(
        'ml-1 flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white leading-none',
        color === 'orange' ? 'bg-orange-500' : 'bg-red-500',
      )}>
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/5"
      style={{
        background: 'linear-gradient(180deg, rgba(8,10,20,0.97) 0%, rgba(12,16,30,0.94) 100%)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.05), 0 16px 40px rgba(0,0,0,0.55)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-3 px-4">

        {/* ── Navigation principale ─────────────────────────────────── */}
        <nav className="flex items-center gap-1.5 min-w-0 overflow-hidden">

          {/* Espace Pilote dropdown */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              ref={triggerRef}
              aria-label="Espace Pilote"
              aria-expanded={piloteMenuOpen}
              onPointerDown={() => setPiloteMenuOpen(p => !p)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-150 select-none border',
                isPiloteActive || piloteMenuOpen
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200 shadow-[0_0_16px_rgba(14,165,233,0.2)]'
                  : 'border-white/8 text-slate-300 hover:border-white/15 hover:bg-white/6 hover:text-white',
              )}
            >
              <Plane className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Espace Pilote</span>
              <span className="md:hidden">Pilote</span>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', piloteMenuOpen && 'rotate-180')} />
              {volsAConfirmerCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white ring-2 ring-[#0a0e1a]">
                  {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
                </span>
              )}
            </button>

            {piloteMenuOpen && (
              <div
                style={dropdownStyle ?? undefined}
                className="w-64 rounded-2xl border border-white/10 bg-[#0d1120]/97 py-2 shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-50 overflow-hidden"
              >
                {piloteMenuItems.map((item, idx) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || (item.href !== '/logbook' && pathname.startsWith(item.href));
                  return (
                    <div key={item.href}>
                      {item.separator && idx > 0 && <div className="mx-3 my-1.5 border-t border-white/6" />}
                      <Link
                        href={item.href}
                        onClick={() => setPiloteMenuOpen(false)}
                        className={cn(
                          'flex items-center gap-3 mx-2 px-3 py-2 text-[13px] rounded-lg transition-all duration-100',
                          isActive
                            ? 'bg-sky-500/18 text-sky-200 border border-sky-500/30'
                            : 'text-slate-300 hover:bg-white/6 hover:text-white border border-transparent',
                        )}
                      >
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-sky-400' : 'text-slate-500')} />
                        <span className="truncate">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="ml-auto flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
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

          {/* Vols à confirmer (badge urgent) */}
          {volsAConfirmerCount > 0 && (
            <Link
              href="/logbook/a-confirmer"
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border transition-all duration-150 shrink-0',
                pathname === '/logbook/a-confirmer'
                  ? 'border-red-500/50 bg-red-500/20 text-red-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/18 hover:text-red-200',
              )}
            >
              À confirmer
              <span className="flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
              </span>
            </Link>
          )}

          {/* Séparateur visuel */}
          <span className="mx-1 h-5 w-px bg-white/8 shrink-0 hidden sm:block" />

          {/* Instruction */}
          <NavLink href="/instruction" active={pathname.startsWith('/instruction')}>
            <Users className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Instruction</span>
          </NavLink>

          {/* Admin */}
          {isAdmin && (
            <NavLink href="/admin" active={pathname.startsWith('/admin')} accent="purple">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Admin
              <Badge count={totalAdminBadge} />
            </NavLink>
          )}

          {/* IFSA */}
          {(isIfsa || isAdmin) && (
            <NavLink href="/ifsa" active={pathname.startsWith('/ifsa')} accent="indigo">
              <Shield className="h-3.5 w-3.5" />
              IFSA
              <Badge count={signalementsNouveauxCount} color="orange" />
            </NavLink>
          )}

          {/* ODW */}
          <NavLink href="/carte-atc" active={pathname === '/carte-atc'} accent="emerald" title="Carte œil du web">
            <Eye className="h-3.5 w-3.5" />
            ODW
          </NavLink>
        </nav>

        {/* ── Section droite ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Séparateur */}
          <span className="mr-1 h-5 w-px bg-white/8 hidden sm:block" />

          {isAdmin && (
            <>
              <NavLink href="/atc" active={pathname.startsWith('/atc')} accent="emerald" title="Espace ATC">
                <Radio className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Espace ATC</span>
                <span className="lg:hidden">ATC</span>
              </NavLink>
              <NavLink href="/siavi" active={pathname.startsWith('/siavi')} accent="red" title="Espace SIAVI">
                <Flame className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Espace SIAVI</span>
                <span className="lg:hidden">SIAVI</span>
              </NavLink>
            </>
          )}

          {/* Séparateur */}
          <span className="mx-1 h-5 w-px bg-white/8 hidden sm:block" />

          <NavLink href="/compte" active={pathname === '/compte'} title="Mon compte">
            <User className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mon compte</span>
          </NavLink>

          <button
            onClick={handleLogout}
            title="Se déconnecter"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold border border-white/8 text-slate-400 transition-all duration-150 hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── Composant interne NavLink ──────────────────────────────────────────── */
const ACCENT = {
  default: { inactive: 'border-white/8 text-slate-300 hover:border-white/15 hover:bg-white/6 hover:text-white', active: 'border-sky-500/50 bg-sky-500/15 text-sky-200 shadow-[0_0_14px_rgba(14,165,233,0.18)]' },
  purple:  { inactive: 'border-white/8 text-slate-300 hover:border-purple-500/35 hover:bg-purple-500/10 hover:text-purple-200', active: 'border-purple-500/50 bg-purple-500/15 text-purple-200 shadow-[0_0_14px_rgba(168,85,247,0.18)]' },
  indigo:  { inactive: 'border-white/8 text-slate-300 hover:border-indigo-500/35 hover:bg-indigo-500/10 hover:text-indigo-200', active: 'border-indigo-500/50 bg-indigo-500/15 text-indigo-200 shadow-[0_0_14px_rgba(99,102,241,0.18)]' },
  emerald: { inactive: 'border-white/8 text-slate-300 hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-200', active: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.18)]' },
  red:     { inactive: 'border-white/8 text-slate-300 hover:border-red-500/35 hover:bg-red-500/10 hover:text-red-200', active: 'border-red-500/50 bg-red-500/15 text-red-200 shadow-[0_0_14px_rgba(239,68,68,0.18)]' },
};

function NavLink({
  href, active, accent = 'default', title, children,
}: {
  href: string; active: boolean; accent?: keyof typeof ACCENT; title?: string; children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <Link
      href={href}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border transition-all duration-150 whitespace-nowrap shrink-0',
        active ? a.active : a.inactive,
      )}
    >
      {children}
    </Link>
  );
}
