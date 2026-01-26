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

  // Récupérer TOUTES les compagnies où le pilote est employé
  const { data: emplois } = await admin.from('compagnie_employes')
    .select('compagnie_id, compagnies(id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire)')
    .eq('pilote_id', user.id);

  // Récupérer TOUTES les compagnies où le pilote est PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire')
    .eq('pdg_id', user.id);

  // Construire la liste de toutes les compagnies disponibles (employé + PDG)
  type CompagnieOption = { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number; role: 'employe' | 'pdg' };
  const compagniesMap = new Map<string, CompagnieOption>();

  // Ajouter les compagnies où il est employé
  (emplois || []).forEach(e => {
    const c = e.compagnies;
    const cObj = c ? (Array.isArray(c) ? c[0] : c) as { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number } : null;
    if (cObj && !compagniesMap.has(cObj.id)) {
      compagniesMap.set(cObj.id, { ...cObj, role: 'employe' });
    }
  });

  // Ajouter les compagnies où il est PDG (priorité sur employé)
  (compagniesPdg || []).forEach(c => {
    compagniesMap.set(c.id, { ...c, role: 'pdg' });
  });

  const compagniesDisponibles = Array.from(compagniesMap.values());

  // Récupérer la flotte de TOUTES les compagnies disponibles
  type FlotteItem = {
    id: string;
    compagnie_id: string;
    type_avion_id: string;
    quantite: number;
    disponibles: number;
    nom_personnalise: string | null;
    capacite_pax_custom: number | null;
    capacite_cargo_custom: number | null;
    types_avion: { id: string; nom: string; code_oaci: string | null; capacite_pax: number; capacite_cargo_kg: number } | null;
  };
  let flotteParCompagnie: Record<string, FlotteItem[]> = {};
  
  if (compagniesDisponibles.length > 0) {
    const compagnieIds = compagniesDisponibles.map(c => c.id);
    const { data: flotte } = await admin.from('compagnie_flotte')
      .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg)')
      .in('compagnie_id', compagnieIds);
    
    // Calculer la disponibilité pour chaque avion
    const flotteWithDisponibilite = await Promise.all((flotte || []).map(async (item) => {
      const { count } = await admin.from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .eq('flotte_avion_id', item.id)
        .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
      
      return {
        ...item,
        disponibles: item.quantite - (count || 0)
      };
    }));

    // Grouper par compagnie
    flotteWithDisponibilite.forEach(item => {
      if (!flotteParCompagnie[item.compagnie_id]) {
        flotteParCompagnie[item.compagnie_id] = [];
      }
      flotteParCompagnie[item.compagnie_id].push(item);
    });
  }

  // Récupérer l'inventaire personnel
  const { data: inventaireData } = await admin.from('inventaire_avions')
    .select('*, types_avion(id, nom, code_oaci, capacite_pax, capacite_cargo_kg, est_militaire)')
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

  // Récupérer les avions individuels de toutes les compagnies
  type AvionIndividuel = {
    id: string;
    compagnie_id: string;
    immatriculation: string;
    nom_bapteme: string | null;
    aeroport_actuel: string;
    statut: string;
    usure_percent: number;
    types_avion: { id: string; nom: string; constructeur: string } | { id: string; nom: string; constructeur: string }[] | null;
  };
  let avionsParCompagnie: Record<string, AvionIndividuel[]> = {};

  if (compagniesDisponibles.length > 0) {
    const compagnieIds = compagniesDisponibles.map(c => c.id);
    const { data: avionsData } = await admin.from('compagnie_avions')
      .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion(id, nom, constructeur)')
      .in('compagnie_id', compagnieIds)
      .order('immatriculation');

    // Grouper par compagnie
    (avionsData || []).forEach(item => {
      if (!avionsParCompagnie[item.compagnie_id]) {
        avionsParCompagnie[item.compagnie_id] = [];
      }
      avionsParCompagnie[item.compagnie_id].push(item as AvionIndividuel);
    });
  }

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
        compagniesDisponibles={compagniesDisponibles}
        flotteParCompagnie={flotteParCompagnie}
        inventairePersonnel={inventairePersonnel}
        avionsParCompagnie={avionsParCompagnie}
      />
    </div>
  );
}
