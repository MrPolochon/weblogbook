import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, HeartPulse } from 'lucide-react';
import Link from 'next/link';
import DepotPlanMedevacForm from './DepotPlanMedevacForm';

export default async function NouveauMedevacPage({ searchParams }: { searchParams: Promise<{ appareil?: string }> }) {
  const { appareil } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles')
    .select('role, siavi')
    .eq('id', user.id)
    .single();

  const canSiavi = profile?.role === 'admin' || profile?.role === 'siavi' || profile?.siavi;
  if (!canSiavi) redirect('/logbook');

  const admin = createAdminClient();

  // Vérifier si un plan actif existe déjà pour cet agent
  // 'en_pause' et 'planifie_suivant' indiquent une mission MEDEVAC multi-segments en cours
  const { count: plansActifs } = await admin.from('plans_vol')
    .select('*', { count: 'exact', head: true })
    .eq('pilote_id', user.id)
    .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'en_pause', 'planifie_suivant']);

  if (plansActifs && plansActifs > 0) {
    redirect('/siavi/medevac');
  }

  // Charger la flotte SIAVI
  const { data: flotte, error: fleetError } = await admin.from('siavi_avions')
    .select('*, types_avion:type_avion_id(id, nom, code_oaci, categorie, capacite_pax, capacite_cargo_kg)')
    .eq('statut', 'ground').gt('usure_percent', 0)
    .order('aeroport_actuel');

  const { data: activeAircraft, error: activeError } = await admin.from('plans_vol').select('siavi_avion_id').not('siavi_avion_id','is',null).in('statut',['depose','en_attente','accepte','en_cours','automonitoring','en_attente_cloture','en_pause','planifie_suivant']);
  if(activeError || fleetError) throw new Error('Impossible de vérifier la disponibilité des appareils.');
  const busyAircraft = new Set((activeAircraft??[]).map(p=>p.siavi_avion_id));
  const availableFleet = (flotte??[]).filter(a=>!busyAircraft.has(a.id));
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-rose-800 p-6 shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30"></div>
        <div className="relative flex items-center gap-4">
          <Link href="/siavi/medevac" className="p-2 rounded-xl bg-slate-900/10 hover:bg-slate-900/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-slate-900/10 backdrop-blur">
            <HeartPulse className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Vol MEDEVAC</h1>
            <p className="text-red-100/80 text-sm">Évacuation médicale d&apos;urgence</p>
          </div>
        </div>
      </div>

      <DepotPlanMedevacForm flotte={availableFleet} initialAircraftId={appareil} />
    </div>
  );
}
