'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Wrench, MapPin, Clock, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface GroundNavBarProps {
  isAdmin: boolean;
  sessionInfo: { aeroport: string; started_at: string } | null;
  userId: string;
}

function SessionTimer({ startedAt, aeroport }: { startedAt: string; aeroport: string }) {
  const [elapsed, setElapsed] = useState('');
  const router = useRouter();

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

  async function handleHorsService() {
    await fetch('/api/ground/session', { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 rounded-lg border border-emerald-900/70 bg-emerald-950/80 px-2.5 py-1 text-emerald-200 font-semibold">
        <MapPin className="h-3.5 w-3.5" />
        {aeroport}
      </span>
      <span className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/70 px-2.5 py-1 text-slate-200 font-mono text-xs">
        <Clock className="h-3 w-3 text-slate-400" />
        {elapsed}
      </span>
      <button
        type="button"
        onClick={handleHorsService}
        className="flex items-center gap-1.5 rounded-lg border border-red-800/50 bg-red-900/20 px-2.5 py-1 text-red-300 text-xs font-medium hover:bg-red-900/40 transition-colors"
      >
        Hors service
      </button>
    </div>
  );
}

export default function GroundNavBar({ isAdmin, sessionInfo, userId: _userId }: GroundNavBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <header
      className="sticky top-0 z-40 border-b border-slate-700/50 bg-[#0a0f1c]"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.7)' }}
    >
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-2 px-3 sm:px-4">
        {/* Logo + titre */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-900/30 border border-emerald-800/40 px-3 py-1.5">
            <Wrench className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-bold text-emerald-200 hidden sm:inline">Ground Crew</span>
          </div>
          {sessionInfo && (
            <SessionTimer aeroport={sessionInfo.aeroport} startedAt={sessionInfo.started_at} />
          )}
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1.5">
          <NavLink href="/ground" active={pathname === '/ground'}>
            <Radio className="h-3.5 w-3.5" />
            Dashboard
          </NavLink>
          {isAdmin && (
            <NavLink href="/logbook" active={false} accent="sky">
              Espace Pilote
            </NavLink>
          )}
        </nav>

        {/* Actions droite */}
        <div className="flex items-center gap-1.5">
          {isAdmin && (
            <Link
              href="/logbook"
              className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Changer d&apos;espace
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-slate-700/50 px-3 py-2 text-sm font-semibold',
              'text-slate-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 transition-colors',
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href, active, accent = 'emerald', children,
}: {
  href: string;
  active: boolean;
  accent?: 'emerald' | 'sky';
  children: React.ReactNode;
}) {
  const colors = {
    emerald: {
      active: 'border-emerald-500/50 bg-emerald-500/20 text-emerald-200',
      inactive: 'border-slate-700/50 text-slate-300 hover:border-emerald-500/40 hover:bg-emerald-500/10',
    },
    sky: {
      active: 'border-sky-500/50 bg-sky-500/20 text-sky-200',
      inactive: 'border-slate-700/50 text-slate-300 hover:border-sky-500/40 hover:bg-sky-500/10',
    },
  };
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors',
        active ? colors[accent].active : colors[accent].inactive,
      )}
    >
      {children}
    </Link>
  );
}
