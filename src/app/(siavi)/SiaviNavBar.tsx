'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Flame, FileText, Mail, LogOut, Clock, Plane, MapPin, User, LayoutDashboard, Landmark, HeartPulse, ClipboardList, Menu, X, CalendarDays } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import AdminSpaceSelector from '@/components/AdminSpaceSelector';
import SpaceNavHeader, { SPACE_NAV_BUTTON } from '@/components/SpaceNavHeader';
import { SIAVI_WORKSPACES } from '@/lib/siavi/workspaces';
import { cn } from '@/lib/utils';

interface SiaviNavBarProps {
  isAdmin: boolean;
  isChief?: boolean;
  enService: boolean;
  estAfis: boolean;
  sessionInfo: { aeroport: string; started_at: string } | null;
  messagesNonLusCount: number;
}

export default function SiaviNavBar({ isAdmin, isChief, enService, estAfis, sessionInfo, messagesNonLusCount }: SiaviNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMedevac = pathname.startsWith('/siavi/medevac');
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


    { href: '/siavi/flotte', label: 'Flotte', icon: Plane },
    { href: '/siavi/rapports', label: 'Rapports', icon: ClipboardList },
    { href: '/siavi/documents', label: 'Documents', icon: FileText },
    { href: '/siavi/calendrier', label: 'Calendrier', icon: CalendarDays },
    { href: '/siavi/messagerie', label: 'Messagerie', icon: Mail },
    { href: '/siavi/felitz-bank', label: 'Banque', icon: Landmark },
    { href: '/siavi/compte', label: 'Compte', icon: User },
    ...(isChief ? [{href:'/siavi/brigade',label:'Chef de brigade',icon:LayoutDashboard}] : []),
    ...(isAdmin ? [{ href: '/siavi/admin', label: 'Administration', icon: LayoutDashboard }] : []),
  ];
  const active = (href: string) => (href === '/siavi/afis' && pathname.startsWith('/siavi/plan/')) || pathname === href || (href !== '/siavi' && pathname.startsWith(`${href}/`));
  const idle = 'border-slate-700/50 bg-slate-950/40 text-slate-200 hover:bg-slate-800 hover:text-white';

  return (
    <SpaceNavHeader className="border-slate-700/50 bg-[#0b0e1a] shadow-lg">
      <div className="mx-auto flex min-h-14 max-w-screen-2xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <nav aria-label="Navigation SIAVI" className="flex min-w-0 items-center gap-2">
          <Link href="/siavi" aria-label="Accueil et choix de fonction SIAVI" className="flex shrink-0 items-center gap-2 rounded-xl border border-red-800/40 bg-red-950/40 px-3 py-2 text-sm font-bold text-red-200">
            <Flame className="h-4 w-4" /><span>Accueil SIAVI</span>
          </Link>
          <div ref={menuRef} className="relative">
            <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="siavi-navigation-menu" onClick={() => setOpen(!open)} className={cn(SPACE_NAV_BUTTON, open ? 'border-orange-500/50 bg-orange-950/50 text-orange-200' : idle)}>
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />} Outils
              {messagesNonLusCount > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">{messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}</span>}
            </button>
            {open && <div id="siavi-navigation-menu" className="absolute left-0 top-full z-[60] mt-2 grid max-h-[calc(100dvh-5rem)] w-[min(20rem,calc(100vw-7rem))] gap-1 overflow-y-auto rounded-2xl border border-slate-600/60 bg-[#0d1120] p-2 shadow-2xl">
              {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active(href) ? 'page' : undefined} className={cn(SPACE_NAV_BUTTON, 'justify-start', active(href) ? 'border-orange-500/50 bg-orange-950/50 text-orange-200' : idle)}>
                <Icon className="h-4 w-4" />{label}
                {href === '/siavi/messagerie' && messagesNonLusCount > 0 && <span className="ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white">{messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}</span>}
              </Link>)}
            </div>}
          </div>

        </nav>
        <div className="order-3 flex w-full items-center justify-center gap-2 text-xs sm:order-none sm:w-auto" aria-label="État du service">
          {isMedevac ? <span className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3 py-1.5 text-rose-200">Équipage de vol · MEDEVAC</span> : enService && sessionInfo ? <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/50 px-3 py-1.5 text-emerald-200">
            <MapPin className="h-3.5 w-3.5" /><span className="font-mono font-bold">{sessionInfo.aeroport}</span>
            <span className="rounded bg-slate-900 px-1.5 py-0.5 font-semibold">{estAfis ? 'AFIS' : 'Pompier'}</span>
            <Clock className="h-3.5 w-3.5" /><span className="font-mono">{elapsed}</span>
          </div> : <span className="text-slate-400">Hors service</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && <AdminSpaceSelector triggerClassName={cn(SPACE_NAV_BUTTON, idle)} />}
          <button type="button" onClick={handleLogout} aria-label="Déconnexion du compte" title="Déconnexion du compte" className={cn(SPACE_NAV_BUTTON, idle, 'hover:text-red-300')}><LogOut className="h-4 w-4" /><span className="hidden xl:inline">Déconnexion</span></button>
        </div>
      </div>
      <nav aria-label="Choisir une fonction SIAVI" className="mx-auto grid w-full max-w-screen-2xl grid-cols-3 gap-2 border-t border-slate-800 px-3 py-2 sm:px-4">
        {Object.entries(SIAVI_WORKSPACES).map(([mode,item]) => <Link key={mode} href={item.href} aria-current={active(item.href)?'page':undefined} className={cn('flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm', active(item.href) ? mode==='pompier'?'border-amber-400 bg-amber-400/15 text-amber-100':mode==='afis'?'border-cyan-400 bg-cyan-400/15 text-cyan-100':'border-rose-400 bg-rose-400/15 text-rose-100' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800')}>
          {mode==='medevac'?<HeartPulse className="h-4 w-4 shrink-0"/>:mode==='afis'?<MapPin className="h-4 w-4 shrink-0"/>:<Flame className="h-4 w-4 shrink-0"/>}
          <span>{mode==='pompier'?'Pompier':mode==='afis'?'Pompier AFIS':'Vols MEDEVAC'}</span>
        </Link>)}
      </nav>
    </SpaceNavHeader>
  );
}
