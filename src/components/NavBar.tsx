'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import NavBarMenu from './NavBarMenu';

export default function NavBar({ isAdmin, isArmee = false, pendingVolsCount = 0, volsAConfirmerCount = 0, hasCompagniePDG = false, hasCompagnie = false }: { isAdmin: boolean; isArmee?: boolean; pendingVolsCount?: number; volsAConfirmerCount?: number; hasCompagniePDG?: boolean; hasCompagnie?: boolean }) {
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
        <NavBarMenu
          isAdmin={isAdmin}
          isArmee={isArmee}
          pendingVolsCount={pendingVolsCount}
          volsAConfirmerCount={volsAConfirmerCount}
          hasCompagniePDG={hasCompagniePDG}
          hasCompagnie={hasCompagnie}
          onLogout={handleLogout}
        />
      </div>
    </header>
  );
}
