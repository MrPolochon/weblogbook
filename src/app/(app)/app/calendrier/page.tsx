import { createClient } from '@/lib/supabase/server';
import { CalendarDays } from 'lucide-react';
import SiteCalendar from '@/components/SiteCalendar';

export const dynamic = 'force-dynamic';

export default async function AppCalendrierPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30">
          <CalendarDays className="h-6 w-6 text-sky-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Calendrier</h1>
          <p className="text-sm text-slate-400 mt-1">
            UTC d’abord (19H UTC), heure locale entre parenthèses (7h Local).
          </p>
        </div>
      </div>
      <SiteCalendar canEdit={profile?.role === 'admin'} variant="dark" />
    </div>
  );
}
