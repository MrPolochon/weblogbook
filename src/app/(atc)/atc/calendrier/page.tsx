import { createClient } from '@/lib/supabase/server';
import { CalendarDays } from 'lucide-react';
import SiteCalendar from '@/components/SiteCalendar';

export const dynamic = 'force-dynamic';

export default async function AtcCalendrierPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-400/30">
          <CalendarDays className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Calendrier</h1>
          <p className="text-sm opacity-70 mt-1">UTC d’abord (19H UTC), heure locale entre parenthèses (7h Local).</p>
        </div>
      </div>
      <SiteCalendar canEdit={profile?.role === 'admin'} variant="light" />
    </div>
  );
}
