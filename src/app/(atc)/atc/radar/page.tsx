import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { configuredServerId } from '@/lib/pftester-odw';
import { hasRadarUnlockCookie } from '@/lib/radar-access';
import PfRadarClient from './PfRadarClient';
import RadarUnlock from './RadarUnlock';

export default async function RadarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    return (
      <div className="max-w-md mx-auto mt-16 card space-y-3 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
          <Lock className="h-5 w-5 text-slate-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-100">Radar indisponible</h1>
        <p className="text-sm text-slate-400">
          Cette page est verrouillée. L’accès se fait uniquement avec le code superadmin.
        </p>
      </div>
    );
  }

  if (!hasRadarUnlockCookie()) {
    return <RadarUnlock />;
  }

  const { data: session } = await supabase
    .from('atc_sessions')
    .select('aeroport, position')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <PfRadarClient
      defaultServerId={configuredServerId()}
      sessionAirport={session?.aeroport ?? null}
      sessionPosition={session?.position ?? null}
    />
  );
}
