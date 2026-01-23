'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ScrollText, Radio, User, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import NavBarMenu from './NavBarMenu';

export default function NavBar({ isAdmin, isArmee = false, pendingVolsCount = 0, volsAConfirmerCount = 0, hasCompagniePDG = false, hasCompagnie = false }: { isAdmin: boolean; isArmee?: boolean; pendingVolsCount?: number; volsAConfirmerCount?: number; hasCompagniePDG?: boolean; hasCompagnie?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <NavBarMenu
          isAdmin={isAdmin}
          isArmee={isArmee}
          pendingVolsCount={pendingVolsCount}
          volsAConfirmerCount={volsAConfirmerCount}
          hasCompagniePDG={hasCompagniePDG}
          hasCompagnie={hasCompagnie}
          onLogout={handleLogout}
        />
        <div className="flex items-center gap-2">
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
