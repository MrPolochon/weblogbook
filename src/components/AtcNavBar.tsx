'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Radio, LayoutDashboard, LogOut, FileText, BookOpen, User, ScrollText } from 'lucide-react';
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
    <div className="flex items-center gap-3 text-sm font-semibold text-slate-800 whitespace-nowrap flex-shrink-0">
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
  gradeNom,
  sessionInfo,
}: {
  isAdmin: boolean;
  enService: boolean;
  gradeNom?: string | null;
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

  const linkBase = 'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0';
  const linkActive = 'bg-sky-100 text-sky-800';
  const linkInactive = 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';

  return (
    <header className="sticky top-0 z-50 border-b border-slate-300 bg-white/90 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-2 md:grid-cols-3 items-center gap-2 sm:gap-4 px-3 sm:px-4">
        <nav className="flex flex-nowrap items-center gap-2 min-w-0 overflow-x-auto">
          <Link href="/atc" className={cn(linkBase, pathname === '/atc' ? linkActive : linkInactive)}>
            <Radio className="h-4 w-4 flex-shrink-0" />
            <span className="hidden md:inline">Tableau de bord ATC</span>
            <span className="md:hidden">Tableau</span>
          </Link>
          <Link href="/atc/documents" className={cn(linkBase, pathname.startsWith('/atc/documents') ? linkActive : linkInactive)}>
            <FileText className="h-4 w-4 flex-shrink-0" />
            Documents
          </Link>
          <Link href="/atc/notams" className={cn(linkBase, pathname.startsWith('/atc/notams') ? linkActive : linkInactive)}>
            <ScrollText className="h-4 w-4 flex-shrink-0" />
            NOTAMs
          </Link>
          {isAdmin && (
            <Link href="/atc/admin" className={cn(linkBase, pathname.startsWith('/atc/admin') ? linkActive : linkInactive)}>
              <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Admin ATC</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          )}
        </nav>
        <div className="hidden md:flex justify-center min-w-0 flex-shrink-0">
          {sessionInfo && (
            <AtcSessionCompte aeroport={sessionInfo.aeroport} position={sessionInfo.position} startedAt={sessionInfo.started_at} />
          )}
        </div>
        <div className="flex justify-end items-center gap-2 flex-shrink-0">
          {gradeNom && (
            <span className="hidden sm:inline whitespace-nowrap text-sm font-medium text-slate-600 px-2 py-1 rounded bg-slate-100" title="Votre grade ATC">
              {gradeNom}
            </span>
          )}
          <Link href="/atc/compte" className={cn(linkBase, 'gap-1.5', pathname === '/atc/compte' ? linkActive : linkInactive)} title="Mon compte">
            <User className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Mon compte</span>
            <span className="sm:hidden">Compte</span>
          </Link>
          {isAdmin && (
            <Link href="/logbook" className={cn(linkBase, 'gap-1.5 text-slate-700 hover:bg-slate-100 hover:text-slate-900')} title="Passer à l'espace pilotes">
              <BookOpen className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Espace pilotes</span>
              <span className="sm:hidden">Pilotes</span>
            </Link>
          )}
          {!enService && (
            <button type="button" onClick={handleLogout} className={cn(linkBase, 'text-slate-700 hover:bg-slate-100 hover:text-red-600')}>
              <LogOut className="h-4 w-4 flex-shrink-0" />
              Déconnexion
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
