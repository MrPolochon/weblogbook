'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Radio, LayoutDashboard, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AtcNavBar({ isAdmin, enService }: { isAdmin: boolean; enService: boolean }) {
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
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
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
        {!enService && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-red-600"
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
