import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Radio } from 'lucide-react';
import AtisBotsClient from './AtisBotsClient';

export const dynamic = 'force-dynamic';

export default async function AtisBotsAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') redirect('/admin');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Radio className="h-7 w-7 text-amber-400" />
            Bots ATIS
          </h1>
          <p className="text-slate-400 mt-1 text-sm">
            Diagnostic et configuration des bots Discord ATIS (multi-instance).
          </p>
        </div>
      </div>

      <AtisBotsClient />
    </div>
  );
}
