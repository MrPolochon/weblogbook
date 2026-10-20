import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { attachMajorEvents } from '@/lib/events/server';
import EventReservations from '@/components/EventReservations';
export const dynamic = 'force-dynamic';
export default async function MajorEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const { data } = await createAdminClient().from('site_calendar_events').select('id,title,description,location,starts_at,ends_at,created_at').eq('id',id).maybeSingle();
  if (!data) notFound(); const [event] = await attachMajorEvents([data]); if (!event.major) notFound();
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8"><div className="max-w-5xl mx-auto space-y-5">
    <Link href="/calendrier" className="text-sky-300 underline">Retour au calendrier</Link><h1 className="text-3xl font-bold">{event.title}</h1>
    <p>{new Date(event.starts_at).toLocaleString('fr-FR',{timeZone:'UTC'})} → {new Date(event.ends_at!).toLocaleString('fr-FR',{timeZone:'UTC'})} UTC · {event.major.airports.join(', ')}</p>
    <p className="whitespace-pre-wrap text-slate-300">{event.description}</p>
    <p className="border border-amber-500/40 p-3 rounded-lg text-amber-200">{event.major.enabled ? 'Événement majeur : tous les pilotes peuvent déposer un plan de vol, même sans slot. Pour figurer au manifeste, réservez un créneau et déposez le plan prérempli. Les strips manuels restent disponibles aux contrôleurs. Les réservations ATC sont confirmées directement.' : 'Cet événement est désactivé. Les nouvelles réservations sont fermées.'}</p>
    <EventReservations event={event}/>
  </div></main>;
}
