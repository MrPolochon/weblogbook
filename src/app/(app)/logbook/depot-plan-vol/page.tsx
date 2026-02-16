import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane, AlertCircle, Radio } from 'lucide-react';
import DepotPlanVolForm from './DepotPlanVolForm';

export default async function DepotPlanVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  // Vérifier si le pilote a déjà un plan actif (accepté, en cours, etc.)
  const { data: planActif } = await supabase
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, statut')
    .eq('pilote_id', user.id)
    .in('statut', ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'])
    .limit(1)
    .single();

  // Si un plan est actif, rediriger vers la page des plans avec message
  if (planActif) {
    redirect('/logbook/plans-vol?active=true');
  }

  const admin = createAdminClient();

  // Récupérer TOUTES les compagnies où le pilote est employé
  const { data: emplois } = await admin.from('compagnie_employes')
    .select('compagnie_id, compagnies(id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire, code_oaci)')
    .eq('pilote_id', user.id);

  // Récupérer TOUTES les compagnies où le pilote est PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom, prix_billet_pax, prix_kg_cargo, pourcentage_salaire, code_oaci')
    .eq('pdg_id', user.id);

  // Construire la liste de toutes les compagnies disponibles (employé + PDG)
  type CompagnieOption = { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number; code_oaci: string | null; role: 'employe' | 'pdg' };
  const compagniesMap = new Map<string, CompagnieOption>();

  // Ajouter les compagnies où il est employé
  (emplois || []).forEach(e => {
    const c = e.compagnies;
    const cObj = c ? (Array.isArray(c) ? c[0] : c) as { id: string; nom: string; prix_billet_pax: number; prix_kg_cargo: number; pourcentage_salaire: number; code_oaci: string | null } : null;
    if (cObj && !compagniesMap.has(cObj.id)) {
      compagniesMap.set(cObj.id, { ...cObj, role: 'employe' });
    }
  });

  // Ajouter les compagnies où il est PDG (priorité sur employé)
  (compagniesPdg || []).forEach(c => {
    compagniesMap.set(c.id, { ...c, role: 'pdg' });
  });

  const compagniesDisponibles = Array.from(compagniesMap.values());

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
    types_avion: { id: string; nom: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number; code_oaci: string | null } | { id: string; nom: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number; code_oaci: string | null }[] | null;
  };
  let avionsParCompagnie: Record<string, AvionIndividuel[]> = {};

  if (compagniesDisponibles.length > 0) {
    const compagnieIds = compagniesDisponibles.map(c => c.id);
    const { data: avionsData } = await admin.from('compagnie_avions')
      .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion(id, nom, constructeur, capacite_pax, capacite_cargo_kg, code_oaci)')
      .in('compagnie_id', compagnieIds)
      .order('immatriculation');

    const nowIso = new Date().toISOString();
    const { data: locationsActives } = await admin.from('compagnie_locations')
      .select('avion_id, loueur_compagnie_id, locataire_compagnie_id, start_at, end_at, statut')
      .in('locataire_compagnie_id', compagnieIds)
      .eq('statut', 'active')
      .lte('start_at', nowIso)
      .gte('end_at', nowIso);

    const leasedOutIds = new Set((locationsActives || []).map(l => l.avion_id));

    // Grouper par compagnie
    (avionsData || []).forEach(item => {
      // Si avion loué à une autre compagnie, ne pas l'afficher pour le propriétaire
      if (leasedOutIds.has(item.id)) {
        return;
      }
      if (!avionsParCompagnie[item.compagnie_id]) {
        avionsParCompagnie[item.compagnie_id] = [];
      }
      avionsParCompagnie[item.compagnie_id].push(item as AvionIndividuel);
    });

    // Ajouter les avions loués aux compagnies locataires
    if (locationsActives && locationsActives.length > 0) {
      const leasedIds = Array.from(new Set(locationsActives.map(l => l.avion_id)));
      const { data: leasedAvions } = await admin.from('compagnie_avions')
        .select('id, compagnie_id, immatriculation, nom_bapteme, aeroport_actuel, statut, usure_percent, types_avion(id, nom, constructeur, capacite_pax, capacite_cargo_kg, code_oaci)')
        .in('id', leasedIds);

      (leasedAvions || []).forEach(item => {
        const loc = locationsActives.find(l => l.avion_id === item.id);
        if (!loc) return;
        const locataireId = loc.locataire_compagnie_id;
        if (!avionsParCompagnie[locataireId]) {
          avionsParCompagnie[locataireId] = [];
        }
        avionsParCompagnie[locataireId].push(item as AvionIndividuel);
      });
    }
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
        inventairePersonnel={inventairePersonnel}
        avionsParCompagnie={avionsParCompagnie}
      />
    </div>
  );
}
