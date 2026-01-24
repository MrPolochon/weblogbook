import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Package } from 'lucide-react';
import MarcheCargoClient from './MarcheCargoClient';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

export default async function MarcheCargoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Régénérer le cargo avant de récupérer les données
  try {
    await admin.rpc('regenerer_cargo_aeroport');
  } catch (e) {
    console.log('RPC regenerer_cargo_aeroport not available');
  }

  // Récupérer les données du cargo pour tous les aéroports
  const { data: cargoData } = await admin.from('aeroport_cargo')
    .select('code_oaci, cargo_disponible, cargo_max, derniere_regeneration');

  // Combiner avec les infos statiques des aéroports
  const aeroportsData = AEROPORTS_PTFS.map(aeroport => {
    const cargo = cargoData?.find(c => c.code_oaci === aeroport.code);
    return {
      code: aeroport.code,
      nom: aeroport.nom,
      taille: aeroport.taille,
      industriel: aeroport.industriel,
      cargoMax: aeroport.cargoMax,
      vor: aeroport.vor,
      freq: aeroport.freq,
      cargo_disponible: cargo?.cargo_disponible ?? aeroport.cargoMax,
      cargo_max: cargo?.cargo_max ?? aeroport.cargoMax,
      derniere_regeneration: cargo?.derniere_regeneration ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Marché du fret</h1>
          <p className="text-slate-400 text-sm">Vue en temps réel de la disponibilité du cargo par aéroport</p>
        </div>
      </div>

      {/* Légende */}
      <div className="card bg-slate-800/50">
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
            <span className="text-slate-300">International</span>
            <span className="text-slate-500 text-xs">(hub cargo)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-sky-500"></div>
            <span className="text-slate-300">Régional</span>
            <span className="text-slate-500 text-xs">(cargo moyen)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
            <span className="text-slate-300">Small</span>
            <span className="text-slate-500 text-xs">(cargo limité)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span className="text-slate-300">Militaire</span>
            <span className="text-slate-500 text-xs">(cargo militaire)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400">🏭</span>
            <span className="text-slate-300">Industriel</span>
            <span className="text-slate-500 text-xs">(+25% cargo)</span>
          </div>
        </div>
      </div>

      <MarcheCargoClient aeroports={aeroportsData} />
    </div>
  );
}
