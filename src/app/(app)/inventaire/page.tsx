import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Plane, Package, Users, Weight, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export default async function InventairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Mon inventaire
  const { data: inventaire } = await admin.from('inventaire_avions')
    .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg)')
    .eq('proprietaire_id', user.id)
    .order('created_at', { ascending: false });

  // Vérifier disponibilité de chaque avion
  const inventaireWithStatus = await Promise.all((inventaire || []).map(async (item) => {
    const { count } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('inventaire_avion_id', item.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    
    return {
      ...item,
      en_vol: (count || 0) > 0
    };
  }));

  const avionsDisponibles = inventaireWithStatus.filter(a => !a.en_vol).length;
  const avionsEnVol = inventaireWithStatus.filter(a => a.en_vol).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-orange-400" />
          <h1 className="text-2xl font-bold text-slate-100">Mon inventaire</h1>
        </div>
        <Link
          href="/marketplace"
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors text-sm"
        >
          Acheter des avions
        </Link>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card bg-orange-500/10 border-orange-500/30">
          <p className="text-sm text-orange-400">Total</p>
          <p className="text-3xl font-bold text-orange-300">{inventaireWithStatus.length}</p>
        </div>
        <div className="card bg-emerald-500/10 border-emerald-500/30">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            Disponibles
          </div>
          <p className="text-3xl font-bold text-emerald-300">{avionsDisponibles}</p>
        </div>
        <div className="card bg-amber-500/10 border-amber-500/30">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <Clock className="h-4 w-4" />
            En vol
          </div>
          <p className="text-3xl font-bold text-amber-300">{avionsEnVol}</p>
        </div>
      </div>

      {/* Liste des avions */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-orange-400" />
          Mes appareils
        </h2>
        
        {inventaireWithStatus.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inventaireWithStatus.map((item) => {
              const avion = item.types_avion as { id: string; nom: string; code_oaci: string; capacite_pax: number; capacite_cargo_kg: number } | null;
              return (
                <div 
                  key={item.id} 
                  className={`bg-slate-800/50 rounded-lg p-4 border ${
                    item.en_vol 
                      ? 'border-amber-500/50' 
                      : 'border-slate-700/50 hover:border-emerald-500/50'
                  } transition-colors`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-200">
                        {item.nom_personnalise || avion?.nom || 'Avion'}
                      </h3>
                      {avion?.code_oaci && (
                        <p className="text-xs text-slate-500 font-mono">{avion.code_oaci}</p>
                      )}
                    </div>
                    <Plane className={`h-8 w-8 ${item.en_vol ? 'text-amber-400' : 'text-slate-600'}`} />
                  </div>
                  
                  <div className="space-y-1.5 mb-3">
                    {avion && avion.capacite_pax > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Users className="h-4 w-4" />
                        <span>{avion.capacite_pax} passagers</span>
                      </div>
                    )}
                    {avion && avion.capacite_cargo_kg > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Weight className="h-4 w-4" />
                        <span>{avion.capacite_cargo_kg.toLocaleString('fr-FR')} kg</span>
                      </div>
                    )}
                  </div>

                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                    item.en_vol 
                      ? 'bg-amber-500/20 text-amber-300' 
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {item.en_vol ? (
                      <>
                        <Clock className="h-3 w-3" />
                        En vol
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3" />
                        Disponible
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <Plane className="h-12 w-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Vous n&apos;avez pas encore d&apos;avion.</p>
            <Link 
              href="/marketplace"
              className="inline-block mt-3 text-purple-400 hover:text-purple-300 font-medium"
            >
              Visiter la marketplace →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
