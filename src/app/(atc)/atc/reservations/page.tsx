import EventReservations from '@/components/EventReservations';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadAllAtcAccessRules } from '@/lib/atc-grade-restrictions';
export default async function AtcReservationsPage() {
  const { airportOptions } = await loadAllAtcAccessRules(createAdminClient());
  return <div className="max-w-5xl mx-auto space-y-5 p-4"><h1 className="text-2xl font-bold">Réserver une position ATC</h1>
    <p>Réservez librement un poste, sans démarrer un service. Les réservations du calendrier des événements utilisent le même planning et ne peuvent pas remplacer votre créneau.</p>
    <Link href="/atc" className="underline">Retour à la prise de service</Link><EventReservations atcAirports={airportOptions}/>
  </div>;
}
