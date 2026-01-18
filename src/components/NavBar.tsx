'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, LayoutDashboard, FileText, User, LogOut, ArrowLeftRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const MODE_KEY = 'logbook_interface_mode';

export function getInterfaceMode(): 'admin' | 'pilote' {
  if (typeof window === 'undefined') return 'pilote';
  return (localStorage.getItem(MODE_KEY) as 'admin' | 'pilote') || 'pilote';
}

export function setInterfaceMode(mode: 'admin' | 'pilote') {
  if (typeof window !== 'undefined') localStorage.setItem(MODE_KEY, mode);
}

export default function NavBar({ isAdmin, pendingVolsCount = 0 }: { isAdmin: boolean; pendingVolsCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const mode = typeof window !== 'undefined' ? getInterfaceMode() : 'pilote';

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function switchToAdmin() {
    setInterfaceMode('admin');
    router.push('/admin');
    router.refresh();
  }

  function switchToPilote() {
    setInterfaceMode('pilote');
    router.push('/logbook');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <nav className="flex items-center gap-1">
          <Link
            href="/logbook"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/logbook')
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <BookOpen className="h-4 w-4" />
            Mon logbook
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
                pathname.startsWith('/admin')
                  ? 'bg-slate-700/50 text-sky-300'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              Admin
              {pendingVolsCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-slate-900"
                  title={`${pendingVolsCount} vol(s) en attente`}
                >
                  {pendingVolsCount > 99 ? '99+' : pendingVolsCount}
                </span>
              )}
            </Link>
          )}
          <Link
            href="/documents"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/documents')
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <FileText className="h-4 w-4" />
            Documents
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={mode === 'pilote' ? switchToAdmin : switchToPilote}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
              title={mode === 'pilote' ? 'Passer en interface Admin' : 'Passer en interface Pilote'}
            >
              <ArrowLeftRight className="h-4 w-4" />
              {mode === 'pilote' ? 'Admin' : 'Pilote'}
            </button>
          )}
          <Link
            href="/compte"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname === '/compte'
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <User className="h-4 w-4" />
            Mon compte
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
