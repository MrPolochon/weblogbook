'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Wrench, LayoutDashboard, LogOut, MessageSquare,
  Building2, MapPin, Clock, ChevronDown, Power, Loader2,
} from 'lucide-react';
import AdminSpaceSelector from '@/components/AdminSpaceSelector';
import { cn } from '@/lib/utils';

// ── Minuterie session ─────────────────────────────────────────────────────────

function SessionInfo({ aeroport, startedAt }: { aeroport: string; startedAt: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function tick() {
      const sec = (Date.now() - new Date(startedAt).getTime()) / 1000;
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      setElapsed(h > 0 ? `${h}h ${m}min` : `${m}min`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <div className="flex items-center gap-2 text-sm font-semibold whitespace-nowrap flex-shrink-0">
      <span className="flex items-center gap-1.5 rounded-xl border border-emerald-900/70 bg-emerald-950/80 px-2.5 py-1 text-emerald-200">
        <MapPin className="h-3.5 w-3.5" />
        {aeroport}
      </span>
      <span className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-slate-200 font-mono text-xs">
        <Clock className="h-3.5 w-3.5 text-slate-400" />
        {elapsed}
      </span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isAdmin: boolean;
  sessionInfo: { aeroport: string; started_at: string } | null;
  userId: string;
  messagesNonLusCount?: number;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function GroundNavBar({
  isAdmin,
  sessionInfo,
  userId: _userId,
  messagesNonLusCount = 0,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [horsServiceLoading, setHorsServiceLoading] = useState(false);

  async function handleHorsService() {
    setHorsServiceLoading(true);
    try {
      const res = await fetch('/api/ground/session', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        console.error('[GC NavBar] Hors service error:', data.error);
      }
      startTransition(() => router.refresh());
    } catch {
      // Non bloquant
    } finally {
      setHorsServiceLoading(false);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    startTransition(() => router.refresh());
  }

  const linkBase =
    'flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold tracking-[0.01em] transition-all whitespace-nowrap flex-shrink-0 border';
  const linkActive =
    'border-emerald-800/60 bg-emerald-950/70 text-emerald-200 shadow-[0_8px_18px_rgba(2,6,23,0.24)]';
  const linkInactive =
    'border-slate-700/45 bg-slate-950/45 text-slate-200 hover:border-slate-500/45 hover:bg-slate-800/78 hover:text-white';
  const headerBg =
    'bg-slate-950/86 border-slate-700/45 shadow-[0_20px_40px_rgba(2,6,23,0.45)]';

  return (
    <header className={cn('sticky top-0 z-50 border-b backdrop-blur-xl', headerBg)}>
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-5 xl:px-6 sm:gap-5 flex-wrap sm:flex-nowrap py-2 sm:py-0 sm:h-[4.5rem]">

        {/* Logo + navigation */}
        <nav className="flex flex-nowrap items-center gap-3 overflow-x-auto overflow-y-visible sm:overflow-visible whitespace-nowrap scrollbar-hide">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-800/40 bg-emerald-900/30 px-3 py-2 flex-shrink-0">
            <Wrench className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-200 hidden sm:inline">Ground Crew</span>
          </div>

          <Link
            href="/ground"
            className={cn(linkBase, pathname === '/ground' ? linkActive : linkInactive)}
          >
            <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>

          <Link
            href="/ground/messagerie"
            className={cn(linkBase, 'relative', pathname.startsWith('/ground/messagerie') ? linkActive : linkInactive)}
          >
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Messagerie</span>
            {messagesNonLusCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-current">
                {messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}
              </span>
            )}
          </Link>

          <div
            className={cn(linkBase, 'cursor-not-allowed opacity-50')}
            title="Bientôt disponible"
          >
            <Building2 className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Entreprise GC</span>
          </div>
        </nav>

        {/* Info session (centre) */}
        <div className="hidden md:flex justify-center min-w-0 flex-shrink-0">
          {sessionInfo && (
            <SessionInfo aeroport={sessionInfo.aeroport} startedAt={sessionInfo.started_at} />
          )}
        </div>

        {/* Actions droite */}
        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          {isAdmin && (
            <AdminSpaceSelector
              triggerClassName={cn(
                linkBase,
                'gap-1.5 border-purple-800/40 text-purple-300 hover:bg-purple-900/30',
              )}
            />
          )}
          {sessionInfo && (
            <button
              type="button"
              onClick={handleHorsService}
              disabled={horsServiceLoading}
              className={cn(linkBase, 'border-red-700/50 bg-red-900/20 text-red-300 hover:bg-red-900/40 hover:text-red-200 disabled:opacity-60')}
            >
              {horsServiceLoading
                ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                : <Power className="h-4 w-4 flex-shrink-0" />
              }
              <span className="hidden lg:inline">
                {horsServiceLoading ? 'Déconnexion...' : 'Hors service'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className={cn(linkBase, 'text-slate-300 hover:bg-slate-700 hover:text-red-400')}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="hidden lg:inline">Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      <div className="sm:hidden px-5 pb-3">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(prev => !prev)}
          className="w-full flex items-center justify-center rounded-lg px-3 py-2 border bg-slate-800/60 text-slate-300 border-slate-700/60"
          aria-label="Ouvrir le menu"
        >
          <ChevronDown className={cn('h-5 w-5 transition-transform', mobileMenuOpen && 'rotate-180')} />
        </button>
        {mobileMenuOpen && (
          <div className="mt-2 grid gap-2">
            {isAdmin && <AdminSpaceSelector />}
            {sessionInfo && (
              <button
                type="button"
                onClick={handleHorsService}
                disabled={horsServiceLoading}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-red-900/20 text-red-300 border border-red-700/50 hover:bg-red-900/40 disabled:opacity-60"
              >
                {horsServiceLoading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Power className="h-4 w-4" />
                }
                {horsServiceLoading ? 'Déconnexion...' : 'Hors service'}
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium bg-slate-800/60 text-slate-300 border border-slate-700/60 hover:bg-slate-700 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
