import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Map, Package, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import MarchePassagersClient from './MarchePassagersClient';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

export default async function MarchePassagersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Régénérer les passagers avant de récupérer les données
  try {
    await admin.rpc('regenerer_passagers_aeroport');
  } catch (e) {
    console.log('RPC regenerer_passagers_aeroport not available');
  }

  // Récupérer les données des passagers pour tous les aéroports
  const { data: passagersData } = await admin.from('aeroport_passagers')
    .select('code_oaci, passagers_disponibles, passagers_max, derniere_regeneration');

  // Combiner avec les infos statiques des aéroports
  const aeroportsData = AEROPORTS_PTFS.map(aeroport => {
    const passagers = passagersData?.find(p => p.code_oaci === aeroport.code);
    return {
      code: aeroport.code,
      nom: aeroport.nom,
      taille: aeroport.taille,
      tourisme: aeroport.tourisme,
      passagersMax: aeroport.passagersMax,
      vor: aeroport.vor,
      freq: aeroport.freq,
      passagers_disponibles: passagers?.passagers_disponibles ?? aeroport.passagersMax,
      passagers_max: passagers?.passagers_max ?? aeroport.passagersMax,
      derniere_regeneration: passagers?.derniere_regeneration ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Map className="h-8 w-8 text-emerald-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Marché des passagers</h1>
          <p className="text-slate-400 text-sm">Vue en temps réel de la disponibilité des passagers par aéroport</p>
        </div>
      </div>

      {/* Légende */}
      <div className="card bg-slate-800/50">
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
            <span className="text-slate-300">International</span>
            <span className="text-slate-500 text-xs">(prix -40% impact)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-sky-500"></div>
            <span className="text-slate-300">Régional</span>
            <span className="text-slate-500 text-xs">(prix -20% impact)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
            <span className="text-slate-300">Small</span>
            <span className="text-slate-500 text-xs">(prix normal)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span className="text-slate-300">Militaire</span>
            <span className="text-slate-500 text-xs">(peu de civils)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400">🏝️</span>
            <span className="text-slate-300">Touristique</span>
            <span className="text-slate-500 text-xs">(+15% remplissage)</span>
          </div>
        </div>
      </div>

      <MarchePassagersClient aeroports={aeroportsData} />

      {/* Lien vers marché cargo */}
      <div className="flex justify-center pt-4">
        <Link
          href="/marche-cargo"
          className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg text-sm transition-colors border border-amber-500/30"
        >
          <Package className="h-4 w-4" />
          Voir le marché du fret
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
