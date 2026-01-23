'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, LayoutDashboard, FileText, User, LogOut, Radio, Shield, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import FelitzBankMenu from './FelitzBankMenu';

export default function NavBar({ isAdmin, isArmee = false, pendingVolsCount = 0, volsAConfirmerCount = 0 }: { isAdmin: boolean; isArmee?: boolean; pendingVolsCount?: number; volsAConfirmerCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <nav className="flex items-center gap-1">
          <Link
            href="/logbook"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
              pathname.startsWith('/logbook')
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <BookOpen className="h-4 w-4" />
            Mon logbook
            {volsAConfirmerCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-slate-900"
                title={`${volsAConfirmerCount} vol(s) à confirmer (vous avez été indiqué comme pilote ou co-pilote)`}
              >
                {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
              </span>
            )}
          </Link>
          {volsAConfirmerCount > 0 && (
            <Link
              href="/logbook/a-confirmer"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors bg-red-900/40 text-red-300 hover:bg-red-900/60',
                pathname === '/logbook/a-confirmer' ? 'ring-1 ring-red-500' : ''
              )}
            >
              À confirmer
              <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                {volsAConfirmerCount > 99 ? '99+' : volsAConfirmerCount}
              </span>
            </Link>
          )}
          {(isArmee || isAdmin) && (
            <Link
              href="/militaire"
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/militaire')
                  ? 'bg-slate-700/50 text-sky-300'
                  : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
              )}
            >
              <Shield className="h-4 w-4" />
              Espace militaire
            </Link>
          )}
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
          <Link
            href="/notams"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/notams')
                ? 'bg-slate-700/50 text-sky-300'
                : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
            )}
          >
            <ScrollText className="h-4 w-4" />
            NOTAMs
          </Link>
          <FelitzBankMenu />
        </nav>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/atc"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
              title="Passer à l'espace ATC"
            >
              <Radio className="h-4 w-4" />
              Espace ATC
            </Link>
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
