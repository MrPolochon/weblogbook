'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, FileText, Mail, LogOut, Clock, Plane, MapPin, User, LayoutDashboard, Landmark, HeartPulse, ClipboardList, Menu, X, CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AdminSpaceSelector from '@/components/AdminSpaceSelector';
import SpaceNavHeader, { SPACE_NAV_BUTTON } from '@/components/SpaceNavHeader';
import { cn } from '@/lib/utils';

interface SiaviNavBarProps {
  isAdmin: boolean;
  enService: boolean;
  estAfis: boolean;
  sessionInfo: { aeroport: string; started_at: string } | null;
  messagesNonLusCount: number;
}

export default function SiaviNavBar({ isAdmin, enService, estAfis, sessionInfo, messagesNonLusCount }: SiaviNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [elapsed, setElapsed] = useState('');
  const startedAt = sessionInfo?.started_at;

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => {
    if (!startedAt) { setElapsed(''); return; }
    const tick = () => {
      const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
      setElapsed(minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes}min`);
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [startedAt]);

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push('/login');
    startTransition(() => router.refresh());
  }

  const links = [
    { href: '/siavi', label: 'Console', icon: Flame },
    { href: '/siavi/medevac/nouveau', label: 'MEDEVAC', icon: HeartPulse },
    { href: '/siavi/flotte', label: 'Flotte', icon: Plane },
    { href: '/siavi/rapports', label: 'Rapports', icon: ClipboardList },
    { href: '/siavi/documents', label: 'Documents', icon: FileText },
    { href: '/siavi/calendrier', label: 'Calendrier', icon: CalendarDays },
    { href: '/siavi/messagerie', label: 'Messagerie', icon: Mail },
    { href: '/siavi/felitz-bank', label: 'Banque', icon: Landmark },
    { href: '/siavi/compte', label: 'Compte', icon: User },
    ...(isAdmin ? [{ href: '/siavi/admin', label: 'Administration', icon: LayoutDashboard }] : []),
  ];
  const active = (href: string) => pathname === href || (href !== '/siavi' && pathname.startsWith(`${href}/`));
  const idle = 'border-slate-700/50 bg-slate-950/40 text-slate-200 hover:bg-slate-800 hover:text-white';

  return (
    <SpaceNavHeader className="border-slate-700/50 bg-[#0b0e1a] shadow-lg">
      <div className="mx-auto flex min-h-14 max-w-screen-2xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <nav aria-label="Navigation SIAVI" className="flex min-w-0 items-center gap-2">
          <Link href="/siavi" aria-label="Console SIAVI" className="flex shrink-0 items-center gap-2 rounded-xl border border-red-800/40 bg-red-950/40 px-3 py-2 text-sm font-bold text-red-200">
            <Flame className="h-4 w-4" /><span>SIAVI</span>
          </Link>
          <div ref={menuRef} className="relative">
            <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="siavi-navigation-menu" onClick={() => setOpen(!open)} className={cn(SPACE_NAV_BUTTON, open ? 'border-orange-500/50 bg-orange-950/50 text-orange-200' : idle)}>
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Menu
              {messagesNonLusCount > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">{messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}</span>}
            </button>
            {open && <div id="siavi-navigation-menu" className="absolute left-0 top-full z-[60] mt-2 grid max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-7rem))] gap-1 overflow-y-auto rounded-2xl border border-slate-600/60 bg-[#0d1120] p-2 shadow-2xl">
              {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active(href) ? 'page' : undefined} className={cn(SPACE_NAV_BUTTON, 'justify-start', active(href) ? 'border-orange-500/50 bg-orange-950/50 text-orange-200' : idle)}>
                <Icon className="h-4 w-4" />{label}
                {href === '/siavi/messagerie' && messagesNonLusCount > 0 && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white">{messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}</span>}
              </Link>)}
            </div>}
          </div>
          <Link href="/siavi/medevac/nouveau" aria-label="Nouvelle mission MEDEVAC" className={cn(SPACE_NAV_BUTTON, idle, 'hidden sm:inline-flex')}><HeartPulse className="h-4 w-4" /><span className="hidden lg:inline">MEDEVAC</span></Link>
        </nav>
        <div className="order-3 flex w-full items-center justify-center gap-2 text-xs sm:order-none sm:w-auto" aria-label="État du service">
          {enService && sessionInfo ? <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/50 px-3 py-1.5 text-emerald-200">
            <MapPin className="h-3.5 w-3.5" /><span className="font-mono font-bold">{sessionInfo.aeroport}</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-semibold">{estAfis ? 'AFIS' : 'Pompier'}</span>
            <Clock className="h-3.5 w-3.5" /><span className="font-mono">{elapsed}</span>
          </div> : <span className="text-slate-400">Hors service</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && <AdminSpaceSelector triggerClassName={cn(SPACE_NAV_BUTTON, idle)} />}
          <button type="button" onClick={handleLogout} aria-label="Déconnexion" title="Déconnexion" className={cn(SPACE_NAV_BUTTON, idle, 'hover:text-red-300')}><LogOut className="h-4 w-4" /><span className="hidden xl:inline">Déconnexion</span></button>
        </div>
      </div>
    </SpaceNavHeader>
  );
}
