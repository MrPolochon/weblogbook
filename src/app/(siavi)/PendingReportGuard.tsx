'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  pendingPlanId: string;
}

export default function PendingReportGuard({ pendingPlanId }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const isOnReportPage = pathname?.startsWith('/siavi/rapports/nouveau');
    if (!isOnReportPage && pendingPlanId) {
      router.replace(`/siavi/rapports/nouveau?plan=${pendingPlanId}`);
    }
  }, [pathname, pendingPlanId, router]);

  return null;
}
