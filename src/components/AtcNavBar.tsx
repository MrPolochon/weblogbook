'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Radio, LayoutDashboard, LogOut, FileText, BookOpen, User, ScrollText, Mail, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

function AtcSessionCompte({ aeroport, position, startedAt, isDark }: { aeroport: string; position: string; startedAt: string; isDark: boolean }) {
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
  
  const badgeClass = isDark 
    ? 'bg-slate-700 text-slate-200 px-2 py-1 rounded'
    : 'bg-slate-100 text-slate-800 px-2 py-1 rounded';
  const timeBadgeClass = isDark
    ? 'bg-sky-900 text-sky-300 px-2 py-1 rounded'
    : 'bg-sky-100 text-sky-800 px-2 py-1 rounded';
    
  return (
    <div className="flex items-center gap-3 text-sm font-semibold whitespace-nowrap flex-shrink-0">
      <span className={badgeClass}>{aeroport}</span>
      <span className={badgeClass}>{position}</span>
      <span className={timeBadgeClass}>{temps}</span>
      <span className={cn(badgeClass, 'tabular-nums')}>{utc}</span>
    </div>
  );
}

export default function AtcNavBar({
  isAdmin,
  enService,
  gradeNom,
  sessionInfo,
  messagesNonLusCount = 0,
}: {
  isAdmin: boolean;
  enService: boolean;
  gradeNom?: string | null;
  sessionInfo?: { aeroport: string; position: string; started_at: string } | null;
  messagesNonLusCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useAtcTheme();
  const isDark = theme === 'dark';

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const linkBase = 'flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0';
  const linkActive = isDark ? 'atc-link-active bg-sky-900 text-sky-300' : 'atc-link-active bg-sky-100 text-sky-800';
  const linkInactive = isDark 
    ? 'text-slate-300 hover:bg-slate-700 hover:text-slate-100' 
    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';

  const headerBg = isDark 
    ? 'bg-slate-900/95 border-slate-700' 
    : 'bg-white/90 border-slate-300';

  return (
    <header className={cn("atc-header sticky top-0 z-50 border-b backdrop-blur", headerBg)}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 sm:gap-5">
        <nav className="flex flex-nowrap items-center gap-3">
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
          <Link href="/atc/messagerie" className={cn(linkBase, 'relative', pathname.startsWith('/atc/messagerie') ? linkActive : linkInactive)}>
            <Mail className="h-4 w-4 flex-shrink-0" />
            <span className="hidden md:inline">Messagerie</span>
            <span className="md:hidden">Msgs</span>
            {messagesNonLusCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-red-500 text-white text-xs font-bold">
                {messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}
              </span>
            )}
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
            <AtcSessionCompte aeroport={sessionInfo.aeroport} position={sessionInfo.position} startedAt={sessionInfo.started_at} isDark={isDark} />
          )}
        </div>
        <div className="flex justify-end items-center gap-3 flex-shrink-0">
          {/* Bouton mode sombre/clair */}
          <button
            type="button"
            onClick={toggleTheme}
            className={cn(
              'p-2.5 rounded-lg transition-colors',
              isDark 
                ? 'bg-slate-700 text-amber-400 hover:bg-slate-600' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
            title={isDark ? 'Passer en mode jour' : 'Passer en mode nuit'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          
          {gradeNom && (
            <span className={cn(
              "hidden sm:inline whitespace-nowrap text-sm font-medium px-2 py-1 rounded",
              isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
            )} title="Votre grade ATC">
              {gradeNom}
            </span>
          )}
          <Link href="/atc/compte" className={cn(linkBase, 'gap-1.5', pathname === '/atc/compte' ? linkActive : linkInactive)} title="Mon compte">
            <User className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline">Mon compte</span>
            <span className="sm:hidden">Compte</span>
          </Link>
          {isAdmin && (
            <Link href="/logbook" className={cn(linkBase, 'gap-1.5', linkInactive)} title="Passer à l'espace pilotes">
              <BookOpen className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Espace pilotes</span>
              <span className="sm:hidden">Pilotes</span>
            </Link>
          )}
          {!enService && (
            <button type="button" onClick={handleLogout} className={cn(linkBase, isDark ? 'text-slate-300 hover:bg-slate-700 hover:text-red-400' : 'text-slate-700 hover:bg-slate-100 hover:text-red-600')}>
              <LogOut className="h-4 w-4 flex-shrink-0" />
              Déconnexion
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
