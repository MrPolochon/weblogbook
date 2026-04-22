'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  pendingPlanId: string;
}

/** Pages rapports où on ne force pas le formulaire (évite boucle après soumission → /rapports/[id]). */
function isExemptFromPendingRedirect(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith('/siavi/rapports/nouveau')) return true;
  // Détail d'un rapport enregistré : /siavi/rapports/<uuid>
  const m = pathname.match(/^\/siavi\/rapports\/([^/]+)$/);
  return Boolean(m && m[1] !== 'nouveau');
}

export default function PendingReportGuard({ pendingPlanId }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pendingPlanId) return;
    if (isExemptFromPendingRedirect(pathname)) return;
    router.replace(`/siavi/rapports/nouveau?plan=${pendingPlanId}`);
  }, [pathname, pendingPlanId, router]);

  return null;
}
