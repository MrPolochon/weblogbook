'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import SiteCalendar from '@/components/SiteCalendar';
import { createClient } from '@/lib/supabase/client';

export default function PublicCalendarPage() {
  const [canEdit, setCanEdit] = useState(false);
  const [backHref, setBackHref] = useState('/login');
  const [backLabel, setBackLabel] = useState('Retour à la connexion');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      setCanEdit(profile?.role === 'admin');
      setBackHref('/logbook');
      setBackLabel('Retour au site');
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen relative overflow-x-hidden bg-slate-950">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-950 to-indigo-950/60" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <Link href={backHref} className="inline-flex items-center gap-2 text-slate-400 hover:text-sky-200 text-sm mb-6">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="mb-6 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30">
            <CalendarDays className="h-6 w-6 text-sky-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">Calendrier</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Un seul calendrier pour tout le monde. Jours et horaires en UTC
              (ex. 19H UTC), heure de ton appareil entre parenthèses (7h Local).
            </p>
          </div>
        </div>
        <SiteCalendar canEdit={canEdit} variant="dark" />
      </div>
    </div>
  );
}
