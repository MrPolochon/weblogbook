import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane } from 'lucide-react';
import DepotPlanVolForm from './DepotPlanVolForm';

export default async function DepotPlanVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const admin = createAdminClient();

  // Récupérer l'emploi du pilote (s'il est employé dans une compagnie)
  const { data: emploi } = await admin.from('compagnie_employes')
    .select('compagnie_id, compagnies(id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire)')
    .eq('pilote_id', user.id)
    .single();

  // Vérifier si le pilote est PDG d'une compagnie
  const { data: compagniePdg } = await admin.from('compagnies')
    .select('id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire')
    .eq('pdg_id', user.id)
    .single();

  // Déterminer la compagnie du pilote (employé OU PDG)
  let compagnieId: string | null = null;
  let compagnieInfo: { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number } | null = null;

  if (emploi?.compagnie_id) {
    compagnieId = emploi.compagnie_id;
    const compagniesData = emploi.compagnies;
    compagnieInfo = compagniesData 
      ? (Array.isArray(compagniesData) ? compagniesData[0] : compagniesData) as typeof compagnieInfo
      : null;
  } else if (compagniePdg) {
    compagnieId = compagniePdg.id;
    compagnieInfo = compagniePdg;
  }

  // Récupérer la flotte de la compagnie si employé ou PDG
  let flotteCompagnie: Array<{
    id: string;
    type_avion_id: string;
    quantite: number;
    disponibles: number;
    nom_personnalise: string | null;
    capacite_pax_custom: number | null;
    capacite_cargo_custom: number | null;
    types_avion: { id: string; nom: string; code_oaci: string | null; capacite_pax: number; capacite_cargo_kg: number } | null;
  }> = [];
  if (compagnieId) {
    const { data: flotte } = await admin.from('compagnie_flotte')
      .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg)')
      .eq('compagnie_id', compagnieId);
    
    // Calculer la disponibilité
    flotteCompagnie = await Promise.all((flotte || []).map(async (item) => {
      const { count } = await admin.from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('flotte_avion_id', item.id)
        .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
      
      return {
        ...item,
        disponibles: item.quantite - (count || 0)
      };
    }));
  }

  // Récupérer l'inventaire personnel
  const { data: inventaireData } = await admin.from('inventaire_avions')
    .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg)')
    .eq('proprietaire_id', user.id);

  // Vérifier disponibilité
  const inventairePersonnel = await Promise.all((inventaireData || []).map(async (item) => {
    const { count } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('inventaire_avion_id', item.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    
    return {
      ...item,
      disponible: (count || 0) === 0
    };
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Plane className="h-7 w-7 text-sky-400" />
          Déposer un plan de vol
        </h1>
      </div>
      <DepotPlanVolForm 
        compagnie={compagnieInfo}
        flotteCompagnie={flotteCompagnie}
        inventairePersonnel={inventairePersonnel}
      />
    </div>
  );
}
