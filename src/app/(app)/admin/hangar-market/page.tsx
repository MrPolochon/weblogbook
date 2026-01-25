import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Store } from 'lucide-react';
import AdminHangarMarketClient from './AdminHangarMarketClient';

export default async function AdminHangarMarketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();

  // Config actuelle
  const { data: config } = await admin.from('hangar_market_config')
    .select('*')
    .single();

  // Stats
  const { count: totalAnnonces } = await admin.from('hangar_market')
    .select('*', { count: 'exact', head: true });

  const { count: annoncesEnVente } = await admin.from('hangar_market')
    .select('*', { count: 'exact', head: true })
    .eq('statut', 'en_vente');

  const { count: annoncesVendues } = await admin.from('hangar_market')
    .select('*', { count: 'exact', head: true })
    .eq('statut', 'vendu');

  // Dernières ventes
  const { data: dernieresVentes } = await admin.from('hangar_market')
    .select(`
      *,
      types_avion:type_avion_id(nom),
      vendeur:vendeur_id(identifiant),
      compagnie_vendeur:compagnie_vendeur_id(nom),
      acheteur:acheteur_id(identifiant),
      compagnie_acheteur:compagnie_acheteur_id(nom)
    `)
    .eq('statut', 'vendu')
    .order('vendu_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Store className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Hangar Market - Admin</h1>
          <p className="text-sm text-slate-400">Gérer les taxes et voir les statistiques</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card bg-slate-700/50">
          <p className="text-sm text-slate-400">Total annonces</p>
          <p className="text-2xl font-bold text-slate-100">{totalAnnonces || 0}</p>
        </div>
        <div className="card bg-amber-500/10 border-amber-500/30">
          <p className="text-sm text-amber-400">En vente</p>
          <p className="text-2xl font-bold text-amber-300">{annoncesEnVente || 0}</p>
        </div>
        <div className="card bg-green-500/10 border-green-500/30">
          <p className="text-sm text-green-400">Vendues</p>
          <p className="text-2xl font-bold text-green-300">{annoncesVendues || 0}</p>
        </div>
      </div>

      <AdminHangarMarketClient 
        taxeActuelle={config?.taxe_vente_pourcent || 5}
        dernieresVentes={dernieresVentes || []}
      />
    </div>
  );
}
