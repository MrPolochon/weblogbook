'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Radio, LayoutDashboard, LogOut, FileText, User, ScrollText, Mail, Moon, Sun, ChevronDown, Flame, Landmark, Radar, BookOpen, Plus, CalendarDays, Grid2X2, X } from 'lucide-react';
import SpaceNavHeader, { SPACE_NAV_BUTTON } from '@/components/SpaceNavHeader';
import AtcPhonebookButton from '@/components/AtcPhonebookButton';
import AtcTelephone from '@/components/AtcTelephone';
import StationComBox from '@/components/StationComBox';
import AtcAtisButton from '@/components/AtcAtisButton';
import AtcCpdlcPanel from '@/components/cpdlc/AtcCpdlcPanel';

import { createClient } from '@/lib/supabase/client';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { atcNavIdle, atcNavOpen, formatElapsedClock } from '@/lib/atc-ui';
import { atcStationLabel } from '@/lib/atc-positions';
import { cn } from '@/lib/utils';

function SessionClock({ startedAt, dark }: { startedAt: string; dark: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className={cn('flex gap-2 font-mono text-[10px] tabular-nums', dark ? 'text-slate-400' : 'text-slate-500')}>
    <span title="Durée de la prise de service">{now ? formatElapsedClock(startedAt, now) : '--:--'}</span>
    <span className="hidden sm:inline" title="Heure UTC">{now ? now.toISOString().slice(11, 19) + 'Z' : '--:--:--Z'}</span>
  </span>;
}

export default function AtcNavBar({ isAdmin, enService, gradeNom, sessionInfo, messagesNonLusCount = 0, userId }: {
  isAdmin: boolean; enService: boolean; gradeNom?: string | null;
  sessionInfo?: { aeroport: string; position: string; started_at: string } | null;
  messagesNonLusCount?: number; userId?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { theme, toggleTheme } = useAtcTheme();
  const dark = theme === 'dark';
  const [menu, setMenu] = useState<'tools' | 'account' | null>(null);
  const [anchor, setAnchor] = useState({ top: 0, right: 8 });
  const toolsTrigger = useRef<HTMLButtonElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const currentTrigger = menu === 'tools' ? toolsTrigger : accountTrigger;
  const active = atcNavOpen(dark), idle = atcNavIdle(dark);
  const item = cn('flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium', dark ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-slate-700 hover:bg-slate-100');
  const isActive = (href: string) => href === '/atc' ? pathname === href : pathname.startsWith(href);
  const tools = [
    { href: '/atc/creer-plan', label: 'Créer un plan', icon: Plus },
    { href: '/atc/notams', label: 'NOTAM', icon: ScrollText },
    { href: '/atc/documents', label: 'Documents', icon: FileText },
    { href: '/atc/calendrier', label: 'Calendrier', icon: CalendarDays },
    { href: '/atc/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount },
    { href: '/atc/felitz-bank', label: 'Felitz Bank', icon: Landmark },
    ...(isAdmin ? [{ href: '/atc/radar', label: 'Radar', icon: Radar }, { href: '/atc/admin', label: 'Administration', icon: LayoutDashboard }] : []),
  ];

  useEffect(() => { setMenu(null); }, [pathname]);
  useEffect(() => {
    if (!menu) return;
    const trigger = currentTrigger.current;
    const reposition = () => {
      const rect = trigger?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    };
    reposition();
    const focusFrame = window.requestAnimationFrame(() => popover.current?.querySelector<HTMLElement>('a, button')?.focus());
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popover.current?.contains(target) && !toolsTrigger.current?.contains(target) && !accountTrigger.current?.contains(target)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null); trigger?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [menu, currentTrigger]);

  async function logout() {
    await createClient().auth.signOut(); router.push('/login'); startTransition(() => router.refresh());
  }

  const dropdown = menu && typeof document !== 'undefined' ? createPortal(
    <div ref={popover} id={`atc-${menu}`} style={{ top: anchor.top, right: anchor.right, maxHeight: `calc(100dvh - ${anchor.top + 8}px)` }} className={cn('fixed z-[100] w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border p-2 shadow-2xl', dark ? 'border-slate-700 bg-[#0b1220]' : 'border-slate-200 bg-white')}>
      <div className="mb-1 flex items-center justify-between px-3 py-1.5"><span className={cn('text-[10px] font-bold uppercase tracking-[.18em]', dark ? 'text-slate-400' : 'text-slate-500')}>{menu === 'tools' ? 'Outils du poste' : 'Votre espace'}</span><button type="button" className={cn('rounded p-1', idle)} aria-label="Fermer le menu" onClick={() => { setMenu(null); currentTrigger.current?.focus(); }}><X className="h-4 w-4" /></button></div>
      {menu === 'tools' ? <nav aria-label="Outils et pages ATC">{tools.map(tool => <Link key={tool.href} href={tool.href} className={cn(item, isActive(tool.href) && active)} aria-current={isActive(tool.href) ? 'page' : undefined} onClick={() => setMenu(null)}><tool.icon className="h-4 w-4" />{tool.label}{Boolean(tool.badge) && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white">{tool.badge! > 99 ? '99+' : tool.badge}</span>}</Link>)}</nav> : <div>
        {gradeNom && <p className={cn('mb-2 rounded-lg px-3 py-2 text-xs font-semibold', dark ? 'bg-slate-800 text-emerald-300' : 'bg-slate-100 text-emerald-800')}>{gradeNom}</p>}
        <button type="button" className={item} onClick={toggleTheme}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{dark ? 'Mode jour' : 'Mode nuit'}</button>
        <Link href="/atc/compte" className={item} onClick={() => setMenu(null)}><User className="h-4 w-4" />Mon compte</Link>
        <Link href="/carte-atc" className={item} onClick={() => setMenu(null)}><BookOpen className="h-4 w-4" />ODW · Carte ATC</Link>
        {isAdmin && <><div className="my-2 border-t border-slate-500/20" /><Link href="/admin" className={item} onClick={() => setMenu(null)}><LayoutDashboard className="h-4 w-4" />Administration générale</Link><Link href="/ground" className={item} onClick={() => setMenu(null)}><Grid2X2 className="h-4 w-4" />Ground Crew</Link><Link href="/siavi" className={item} onClick={() => setMenu(null)}><Flame className="h-4 w-4" />Espace SIAVI</Link><Link href="/logbook" className={item} onClick={() => setMenu(null)}><BookOpen className="h-4 w-4" />Espace pilotes</Link></>}
        {!enService && <><div className="my-2 border-t border-slate-500/20" /><button type="button" className={item} onClick={() => void logout()}><LogOut className="h-4 w-4" />Déconnexion</button></>}
      </div>}
    </div>, document.body) : null;

  return <SpaceNavHeader className={cn('atc-header', dark ? 'border-slate-800 bg-[#080d16]' : 'border-slate-300 bg-white')}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-4">
      <div className="flex min-w-0 items-center gap-2 lg:pr-3">
        <Link href="/atc" aria-label="Console ATC" aria-current={pathname === '/atc' ? 'page' : undefined} className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors', pathname === '/atc' ? active : idle)}><Radio className="h-4 w-4" /></Link>
        <div className="min-w-0">
          <p className={cn('truncate text-xs font-bold', dark ? 'text-slate-100' : 'text-slate-900')}>{sessionInfo ? atcStationLabel(sessionInfo.aeroport, sessionInfo.position, `${sessionInfo.aeroport} ${sessionInfo.position}`) : 'ESPACE ATC'}<span className={cn('ml-2 inline-block h-1.5 w-1.5 rounded-full', enService ? 'bg-emerald-400' : 'bg-slate-500')} title={enService ? 'En service' : 'Hors service'} /></p>
          {sessionInfo ? <SessionClock startedAt={sessionInfo.started_at} dark={dark} /> : <p className={cn('text-[10px]', dark ? 'text-slate-500' : 'text-slate-600')}>Hors service</p>}
        </div>
      </div>
      <nav aria-label="Communications ATC" className="col-span-2 row-start-2 flex flex-wrap items-center gap-0.5 border-t border-slate-500/15 pt-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
        {enService && sessionInfo && <><StationComBox aeroport={sessionInfo.aeroport} position={sessionInfo.position} isDark={dark} /><AtcCpdlcPanel />{userId && <AtcAtisButton aeroport={sessionInfo.aeroport} position={sessionInfo.position} userId={userId} />}<AtcTelephone aeroport={sessionInfo.aeroport} position={sessionInfo.position} /><AtcPhonebookButton isDark={dark} /></>}
        {!enService && <Link href="/atc" className={cn(SPACE_NAV_BUTTON, active)}>Console · Prendre mon service</Link>}
      </nav>
      <div className="col-start-2 row-start-1 flex items-center gap-1 lg:col-start-3">
        <button ref={toolsTrigger} type="button" aria-label="Outils et pages ATC" aria-expanded={menu === 'tools'} aria-controls="atc-tools" onClick={() => setMenu(value => value === 'tools' ? null : 'tools')} className={cn(SPACE_NAV_BUTTON, 'relative', menu === 'tools' || tools.some(tool => isActive(tool.href)) ? active : idle)}><Grid2X2 className="h-4 w-4" /><span className="hidden sm:inline">Outils</span><ChevronDown className={cn('h-3 w-3 transition-transform', menu === 'tools' && 'rotate-180')} />{messagesNonLusCount > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-current bg-red-500" />}</button>
        <button ref={accountTrigger} type="button" aria-label="Options du compte ATC" aria-expanded={menu === 'account'} aria-controls="atc-account" onClick={() => setMenu(value => value === 'account' ? null : 'account')} className={cn(SPACE_NAV_BUTTON, menu === 'account' ? active : idle)}><User className="h-4 w-4" /><ChevronDown className={cn('h-3 w-3 transition-transform', menu === 'account' && 'rotate-180')} /></button>
      </div>
    </div>{dropdown}
  </SpaceNavHeader>;
}
