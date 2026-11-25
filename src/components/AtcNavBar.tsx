'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import SpaceNavHeader, { SPACE_NAV_BUTTON } from '@/components/SpaceNavHeader';
import { createClient } from '@/lib/supabase/client';
import {
  Radio, LayoutDashboard, LogOut, FileText, User, ScrollText, Mail, Moon, Sun,
  ChevronDown, Menu, Flame, Landmark, Radar, BookOpen, Plus, CalendarDays,
} from 'lucide-react';
import AtcPhonebookButton from '@/components/AtcPhonebookButton';
import AtcTelephone from '@/components/AtcTelephone';
import StationComBox from '@/components/StationComBox';
import AtcAtisButton from '@/components/AtcAtisButton';
import AdminSpaceSelector from '@/components/AdminSpaceSelector';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef, useTransition } from 'react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { atcNavIdle, atcNavOpen, formatElapsedClock } from '@/lib/atc-ui';

function AtcSessionCompte({ aeroport, position, startedAt, isDark }: { aeroport: string; position: string; startedAt: string; isDark: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const utc = now.toISOString().substring(11, 19) + 'Z';

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border px-2 py-1 font-semibold whitespace-nowrap',
      isDark ? 'border-emerald-800/60 bg-emerald-950/50' : 'border-emerald-300/80 bg-emerald-50/90',
    )}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className={cn('font-mono text-sm font-black tracking-wide', isDark ? 'text-emerald-200' : 'text-emerald-800')}>{aeroport}</span>
      <span className={cn('text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded', isDark ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-700')}>{position}</span>
      <AtcPhonebookButton isDark={isDark} />
      <span className={cn('font-mono text-xs tabular-nums', isDark ? 'text-sky-200' : 'text-sky-800')}>{formatElapsedClock(startedAt, now)}</span>
      <span className={cn('font-mono text-xs tabular-nums hidden lg:inline', isDark ? 'text-slate-400' : 'text-slate-500')}>{utc}</span>
    </div>
  );
}

export default function AtcNavBar({
  isAdmin,
  enService,
  gradeNom,
  sessionInfo,
  messagesNonLusCount = 0,
  userId,
}: {
  isAdmin: boolean;
  enService: boolean;
  gradeNom?: string | null;
  sessionInfo?: { aeroport: string; position: string; started_at: string } | null;
  messagesNonLusCount?: number;
  userId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { theme, toggleTheme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [atcMenuOpen, setAtcMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => { setAccountMenuOpen(false); }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const targetNode = event.target as Node | null;
      const containsTarget = menuRef.current ? !!targetNode && menuRef.current.contains(targetNode) : false;
      if (menuRef.current && !containsTarget) setAtcMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function updateDropdownPosition() {
      if (!atcMenuOpen || !triggerRef.current) {
        setDropdownStyle(null);
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({ position: 'fixed', top: Math.round(rect.bottom + 4), left: Math.round(rect.left), zIndex: 70 });
    }
    updateDropdownPosition();
    if (!atcMenuOpen) return;
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [atcMenuOpen]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    startTransition(() => router.refresh());
  }

  const atcMenuItems = [
    { href: '/atc', label: 'Console', icon: Radio, badge: 0 },
    { href: '/atc/creer-plan', label: 'Créer un plan', icon: Plus, badge: 0 },
    { href: '/atc/documents', label: 'Documents', icon: FileText, badge: 0 },
    { href: '/atc/calendrier', label: 'Calendrier', icon: CalendarDays, badge: 0 },
    { href: '/atc/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount },
    { href: '/atc/felitz-bank', label: 'Felitz Bank', icon: Landmark, badge: 0 },
  ];

  const isAtcMenuActive = atcMenuItems.some((item) =>
    item.href === '/atc' ? pathname === '/atc' : Boolean(pathname?.startsWith(item.href)),
  );

  const linkBase = SPACE_NAV_BUTTON;
  const linkActive = cn('atc-link-active', atcNavOpen(isDark));
  const linkInactive = atcNavIdle(isDark);

  const headerBg = isDark
    ? 'bg-[#05080e] border-slate-800'
    : 'bg-white border-slate-300';

  const dropdownBg = isDark
    ? 'bg-[#0b1220] border-slate-700 shadow-2xl'
    : 'bg-white border-slate-200 shadow-xl';

  const dropdownItemActive = isDark ? 'bg-sky-950 text-sky-200' : 'bg-sky-100 text-sky-900';
  const dropdownItemInactive = isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100';

  return (
    <SpaceNavHeader className={cn('atc-header', headerBg)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 min-h-14">
        <nav aria-label="Navigation ATC" className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Link href="/atc" className="hidden sm:flex items-center gap-2 pr-2 mr-1 border-r border-slate-700/30 shrink-0">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', isDark ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700')}>
              <Radio className="h-4 w-4" />
            </span>
            <span className={cn('text-[11px] font-black tracking-[0.18em]', isDark ? 'text-slate-200' : 'text-slate-800')}>ATC</span>
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              ref={triggerRef}
              onPointerDown={() => setAtcMenuOpen((prev) => !prev)}
              className={cn(linkBase, isAtcMenuActive ? linkActive : linkInactive, 'relative')}
            >
              <Menu className="h-4 w-4" />
              <span className="hidden md:inline">Menu</span>
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', atcMenuOpen && 'rotate-180')} />
              {messagesNonLusCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}
                </span>
              )}
            </button>
            {atcMenuOpen && (
              <div style={dropdownStyle ?? undefined} className={cn('atc-menu-dropdown fixed w-56 rounded-xl border p-1 z-[80]', dropdownBg)}>
                {atcMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAtcMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 text-sm rounded-lg',
                        pathname === item.href || (item.href !== '/atc' && pathname.startsWith(item.href))
                          ? dropdownItemActive
                          : dropdownItemInactive,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                      {item.badge > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {enService && sessionInfo && (
            <StationComBox aeroport={sessionInfo.aeroport} position={sessionInfo.position} isDark={isDark} />
          )}

          <Link href="/atc/notams" className={cn(linkBase, pathname.startsWith('/atc/notams') ? linkActive : linkInactive)}>
            <ScrollText className="h-4 w-4" />
            <span className="hidden sm:inline">NOTAM</span>
          </Link>
          {sessionInfo && userId && (
            <>
              <AtcAtisButton aeroport={sessionInfo.aeroport} position={sessionInfo.position} userId={userId} />
              <AtcTelephone aeroport={sessionInfo.aeroport} position={sessionInfo.position} />
            </>
          )}
          {isAdmin && (
            <Link href="/atc/radar" className={cn(linkBase, pathname.startsWith('/atc/radar') ? linkActive : (isDark ? 'text-emerald-300 hover:bg-emerald-950' : 'text-emerald-700 hover:bg-emerald-50'))}>
              <Radar className="h-4 w-4" />
              <span className="hidden sm:inline">Radar</span>
            </Link>
          )}
          {isAdmin && (
            <Link href="/atc/admin" className={cn(linkBase, pathname.startsWith('/atc/admin') ? linkActive : linkInactive)}>
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
        </nav>

        <div className="hidden xl:flex justify-center min-w-0 shrink-0">
          {sessionInfo && (
            <AtcSessionCompte aeroport={sessionInfo.aeroport} position={sessionInfo.position} startedAt={sessionInfo.started_at} isDark={isDark} />
          )}
        </div>

        <button type="button" onClick={() => setAccountMenuOpen(value => !value)}
          aria-label="Options du poste ATC" aria-expanded={accountMenuOpen} aria-controls="atc-options"
          className={cn(linkBase, 'shrink-0', accountMenuOpen ? linkActive : linkInactive)}>
          <User className="h-4 w-4" /><span className="hidden 2xl:inline">Options</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', accountMenuOpen && 'rotate-180')} />
        </button>
      </div>

      {sessionInfo && (
        <div className="xl:hidden px-3 pb-2 overflow-x-auto">
          <AtcSessionCompte aeroport={sessionInfo.aeroport} position={sessionInfo.position} startedAt={sessionInfo.started_at} isDark={isDark} />
        </div>
      )}

      {accountMenuOpen && (
        <div id="atc-options" className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-500/30 p-2" aria-label="Options du poste">
          {gradeNom && <span className="px-2 text-xs font-semibold">{gradeNom}</span>}
          <Link href="/carte-atc" className={cn(linkBase, linkInactive)}>ODW</Link>
          {isAdmin && <AdminSpaceSelector triggerClassName={cn(linkBase, linkInactive)} />}
          <button type="button" onClick={toggleTheme} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', isDark ? 'bg-slate-800 text-amber-300' : 'bg-slate-100 text-slate-700')}>
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? 'Mode jour' : 'Mode nuit'}
          </button>
          <Link href="/atc/compte" className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', linkInactive)}>
            <User className="h-4 w-4" /> Mon compte
          </Link>
          {isAdmin && (
            <>
              <Link href="/siavi" className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', isDark ? 'bg-red-950 text-red-300' : 'bg-red-100 text-red-700')}>
                <Flame className="h-4 w-4" /> Espace SIAVI
              </Link>
              <Link href="/logbook" className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', linkInactive)}>
                <BookOpen className="h-4 w-4" /> Espace pilotes
              </Link>
            </>
          )}
          {!enService && (
            <button type="button" onClick={handleLogout} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', isDark ? 'text-slate-300' : 'text-slate-700')}>
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          )}
        </div>
      )}
    </SpaceNavHeader>
  );
}
