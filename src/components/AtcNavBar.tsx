'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Radio, LayoutDashboard, LogOut, FileText, BookOpen, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

function AtcSessionCompte({ aeroport, position, startedAt }: { aeroport: string; position: string; startedAt: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedSec = (now.getTime() - new Date(startedAt).getTime()) / 1000;
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const temps = h > 0 ? `${h}h ${m}min` : `${m}min`;
  const utc = now.toISOString().substring(11, 19) + ' UTC';
  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
      <span className="bg-slate-100 px-2 py-1 rounded">{aeroport}</span>
      <span className="bg-slate-100 px-2 py-1 rounded">{position}</span>
      <span className="bg-sky-100 text-sky-800 px-2 py-1 rounded">{temps}</span>
      <span className="bg-slate-100 px-2 py-1 rounded tabular-nums">{utc}</span>
    </div>
  );
}

export default function AtcNavBar({
  isAdmin,
  enService,
  sessionInfo,
}: {
  isAdmin: boolean;
  enService: boolean;
  sessionInfo?: { aeroport: string; position: string; started_at: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-300 bg-white/90 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-3 items-center gap-4 px-4">
        <nav className="flex items-center gap-1">
          <Link
            href="/atc"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === '/atc' ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <Radio className="h-4 w-4" />
            Tableau de bord ATC
          </Link>
          <Link
            href="/atc/documents"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/atc/documents') ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            )}
          >
            <FileText className="h-4 w-4" />
            Documents
          </Link>
          {isAdmin && (
            <Link
              href="/atc/admin"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/atc/admin') ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin ATC
            </Link>
          )}
        </nav>
        <div className="flex justify-center">
          {sessionInfo && (
            <AtcSessionCompte aeroport={sessionInfo.aeroport} position={sessionInfo.position} startedAt={sessionInfo.started_at} />
          )}
        </div>
        <div className="flex justify-end items-center gap-2">
          <Link
            href="/atc/compte"
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === '/atc/compte' ? 'bg-sky-100 text-sky-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            )}
            title="Mon compte"
          >
            <User className="h-4 w-4" />
            Mon compte
          </Link>
          {isAdmin && (
            <Link
              href="/logbook"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              title="Passer à l'espace pilotes"
            >
              <BookOpen className="h-4 w-4" />
              Espace pilotes
            </Link>
          )}
          {!enService && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
