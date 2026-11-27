'use client';

import { usePathname } from 'next/navigation';
import ComBox from '@/components/ComBox';

/** The deposited-plan console owns its inline receiver and DCDU. */
export default function PilotObserverRadio({ participantName, hasDepositedPlan }: { participantName: string; hasDepositedPlan: boolean }) {
  const pathname = usePathname();
  if (hasDepositedPlan && pathname === '/logbook/plans-vol') return null;
  return <ComBox participantName={participantName} observer />;
}
