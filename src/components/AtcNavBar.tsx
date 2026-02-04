'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Radio, LayoutDashboard, LogOut, FileText, BookOpen, User, ScrollText, Mail, Moon, Sun, ChevronDown, Menu, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useRef } from 'react';
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
  const [atcMenuOpen, setAtcMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AtcNavBar.tsx:62',message:'handleClickOutside',data:{atcMenuOpen,hasMenuRef:!!menuRef.current,targetTag:(event.target as HTMLElement | null)?.tagName || null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      const targetNode = event.target as Node | null;
      const containsTarget = menuRef.current ? !!targetNode && menuRef.current.contains(targetNode) : false;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AtcNavBar.tsx:68',message:'containsCheck',data:{containsTarget,hasMenuRef:!!menuRef.current,targetTag:(event.target as HTMLElement | null)?.tagName || null,menuOpen:atcMenuOpen,hasComposedPath:typeof (event as unknown as { composedPath?: () => EventTarget[] }).composedPath === 'function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      if (menuRef.current && !containsTarget) {
        setAtcMenuOpen(false);
      }
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
      const top = Math.round(rect.bottom + 4);
      const left = Math.round(rect.left);
      setDropdownStyle({ position: 'fixed', top, left, zIndex: 70 });
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
    router.refresh();
  }

  const atcMenuItems = [
    { href: '/atc', label: 'Tableau de bord', icon: Radio, badge: 0 },
    { href: '/atc/documents', label: 'Documents', icon: FileText, badge: 0 },
    { href: '/atc/messagerie', label: 'Messagerie', icon: Mail, badge: messagesNonLusCount },
  ];

  const isAtcMenuActive = pathname === '/atc' || pathname.startsWith('/atc/documents') || pathname.startsWith('/atc/messagerie');

  const linkBase = 'flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0';
  const linkActive = isDark ? 'atc-link-active bg-sky-900 text-sky-300' : 'atc-link-active bg-sky-100 text-sky-800';
  const linkInactive = isDark 
    ? 'text-slate-300 hover:bg-slate-700 hover:text-slate-100' 
    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';

  const headerBg = isDark 
    ? 'bg-slate-900/95 border-slate-700' 
    : 'bg-white/90 border-slate-300';

  const dropdownBg = isDark
    ? 'bg-slate-800 border-slate-700'
    : 'bg-white border-slate-300';

  const dropdownItemActive = isDark
    ? 'bg-slate-700/50 text-sky-300'
    : 'bg-sky-100 text-sky-800';

  const dropdownItemInactive = isDark
    ? 'text-slate-300 hover:bg-slate-700/30 hover:text-slate-100'
    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900';

  return (
    <header className={cn("atc-header sticky top-0 z-50 border-b backdrop-blur", headerBg)}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 sm:gap-5 flex-wrap sm:flex-nowrap py-2 sm:py-0 sm:h-16">
        <nav className="flex flex-nowrap items-center gap-3 overflow-x-auto overflow-y-visible sm:overflow-visible whitespace-nowrap scrollbar-hide">
          {/* Menu déroulant ATC */}
          <div className="relative" ref={menuRef}>
            <button
              ref={triggerRef}
              onPointerDown={() => {
                setAtcMenuOpen((prev) => !prev);
              }}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors relative flex-shrink-0',
                isAtcMenuActive ? linkActive : linkInactive
              )}
            >
              <Menu className="h-4 w-4 flex-shrink-0" />
              <span className="hidden md:inline">Menu ATC</span>
              <span className="md:hidden">Menu</span>
              <ChevronDown className={cn('h-4 w-4 transition-transform flex-shrink-0', atcMenuOpen && 'rotate-180')} />
              {messagesNonLusCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-current"
                  title={`${messagesNonLusCount} message(s) non lu(s)`}
                >
                  {messagesNonLusCount > 99 ? '99+' : messagesNonLusCount}
                </span>
              )}
            </button>
            
            {atcMenuOpen && (
              <div style={dropdownStyle ?? undefined} className={cn("fixed w-56 rounded-lg border py-1 shadow-xl z-50", dropdownBg)}>
                {atcMenuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAtcMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                        pathname === item.href || (item.href !== '/atc' && pathname.startsWith(item.href))
                          ? dropdownItemActive
                          : dropdownItemInactive
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {item.label}
                      {item.badge > 0 && (
                        <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

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
            <AtcSessionCompte aeroport={sessionInfo.aeroport} position={sessionInfo.position} startedAt={sessionInfo.started_at} isDark={isDark} />
          )}
        </div>
        <div className="flex justify-end items-center gap-3 flex-shrink-0">
          {/* Bouton mode sombre/clair (desktop) */}
          <button
            type="button"
            onClick={toggleTheme}
            className={cn(
              'p-2.5 rounded-lg transition-colors hidden sm:inline-flex',
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
          <div className="hidden sm:flex items-center gap-3">
            <Link href="/atc/compte" className={cn(linkBase, 'gap-1.5', pathname === '/atc/compte' ? linkActive : linkInactive)} title="Mon compte">
              <User className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Mon compte</span>
              <span className="sm:hidden">Compte</span>
            </Link>
            {isAdmin && (
              <>
                <Link href="/siavi" className={cn(linkBase, 'gap-1.5', isDark ? 'text-red-300 hover:bg-red-900/50 hover:text-red-200' : 'text-red-700 hover:bg-red-100 hover:text-red-800')} title="Passer à l'espace SIAVI">
                  <Flame className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">SIAVI</span>
                </Link>
                <Link href="/logbook" className={cn(linkBase, 'gap-1.5', linkInactive)} title="Passer à l'espace pilotes">
                  <BookOpen className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Pilotes</span>
                </Link>
              </>
            )}
            {!enService && (
              <button type="button" onClick={handleLogout} className={cn(linkBase, isDark ? 'text-slate-300 hover:bg-slate-700 hover:text-red-400' : 'text-slate-700 hover:bg-slate-100 hover:text-red-600')}>
                <LogOut className="h-4 w-4 flex-shrink-0" />
                Déconnexion
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="sm:hidden px-5 pb-3">
        <button
          type="button"
          onClick={() => setAccountMenuOpen((prev) => !prev)}
          className={cn(
            'w-full flex items-center justify-center rounded-lg px-3 py-2 border',
            isDark ? 'bg-slate-800/60 text-slate-300 border-slate-700/60' : 'bg-slate-100 text-slate-700 border-slate-300'
          )}
          aria-label="Ouvrir le menu compte"
        >
          <ChevronDown className={cn('h-5 w-5 transition-transform', accountMenuOpen && 'rotate-180')} />
        </button>

        {accountMenuOpen && (
          <div className="mt-2 grid gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors border',
                isDark
                  ? 'bg-slate-800/60 text-amber-300 border-slate-700/60 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              )}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Mode jour' : 'Mode nuit'}
            </button>
            <Link
              href="/atc/compte"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === '/atc/compte' ? linkActive : linkInactive
              )}
            >
              <User className="h-4 w-4" />
              Mon compte
            </Link>
            {isAdmin && (
              <>
                <Link
                  href="/siavi"
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isDark ? 'bg-red-900/60 text-red-300 hover:bg-red-800' : 'bg-red-100 text-red-700 hover:bg-red-200'
                  )}
                >
                  <Flame className="h-4 w-4" />
                  Espace SIAVI
                </Link>
                <Link
                  href="/logbook"
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    linkInactive
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                  Espace pilotes
                </Link>
              </>
            )}
            {!enService && (
              <button
                type="button"
                onClick={handleLogout}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isDark ? 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-red-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-red-600'
                )}
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
