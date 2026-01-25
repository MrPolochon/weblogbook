import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Building2, Users, Plane, Crown, Clock, Settings, DollarSign } from 'lucide-react';
import Link from 'next/link';
import MaCompagnieClient from './MaCompagnieClient';

function formatHeures(minutes: number | null | undefined): string {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default async function MaCompagniePage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Récupérer TOUTES les compagnies où l'utilisateur est employé
  const { data: emplois } = await admin.from('compagnie_employes')
    .select('compagnie_id, compagnies(id, nom)')
    .eq('pilote_id', user.id);

  // Récupérer TOUTES les compagnies où l'utilisateur est PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom')
    .eq('pdg_id', user.id);

  // Construire la liste de toutes les compagnies
  type CompagnieOption = { id: string; nom: string; role: 'employe' | 'pdg' };
  const compagniesMap = new Map<string, CompagnieOption>();

  (emplois || []).forEach(e => {
    const c = e.compagnies;
    const cObj = c ? (Array.isArray(c) ? c[0] : c) as { id: string; nom: string } : null;
    if (cObj && !compagniesMap.has(cObj.id)) {
      compagniesMap.set(cObj.id, { ...cObj, role: 'employe' });
    }
  });

  (compagniesPdg || []).forEach(c => {
    compagniesMap.set(c.id, { ...c, role: 'pdg' });
  });

  const compagniesDisponibles = Array.from(compagniesMap.values());

  if (compagniesDisponibles.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Building2 className="h-8 w-8 text-sky-400" />
          Ma compagnie
        </h1>
        <div className="card">
          <p className="text-slate-400">Vous n&apos;êtes membre d&apos;aucune compagnie.</p>
          <p className="text-sm text-slate-500 mt-2">Contactez un administrateur pour être assigné à une compagnie.</p>
        </div>
      </div>
    );
  }

  // Déterminer la compagnie à afficher
  const selectedId = searchParams.c || compagniesDisponibles[0].id;
  const selectedCompagnieOption = compagniesDisponibles.find(c => c.id === selectedId) || compagniesDisponibles[0];

  // Récupérer les infos complètes de la compagnie sélectionnée
  const { data: compagnie } = await admin.from('compagnies')
    .select('*, profiles!compagnies_pdg_id_fkey(identifiant)')
    .eq('id', selectedCompagnieOption.id)
    .single();

  // Liste des employés avec leurs heures de vol
  const { data: employes } = await admin.from('compagnie_employes')
    .select('*, profiles(id, identifiant)')
    .eq('compagnie_id', selectedCompagnieOption.id);

  // Calculer les heures de vol par pilote
  // On compte les heures de DEUX sources :
  // 1. Table 'vols' (logbook classique) avec statut 'valide'
  // 2. Table 'plans_vol' (vols commerciaux) avec statut 'cloture' 
  const employeIds = (employes || []).map(e => {
    const p = e.profiles;
    const pObj = p ? (Array.isArray(p) ? p[0] : p) : null;
    return (pObj as { id: string } | null)?.id;
  }).filter(Boolean);
  
  const heuresParPilote: Record<string, number> = {};
  if (employeIds.length > 0) {
    // Source 1: Table vols (logbook classique)
    const { data: vols } = await admin.from('vols')
      .select('pilote_id, duree_minutes')
      .eq('compagnie_id', selectedCompagnieOption.id)
      .eq('statut', 'valide')
      .in('pilote_id', employeIds);

    (vols || []).forEach(v => {
      if (v.pilote_id) {
        heuresParPilote[v.pilote_id] = (heuresParPilote[v.pilote_id] || 0) + (v.duree_minutes || 0);
      }
    });

    // Source 2: Table plans_vol (vols commerciaux clôturés)
    // Le temps réel est calculé à partir de accepted_at et demande_cloture_at (ou cloture_at)
    const { data: plansVol } = await admin.from('plans_vol')
      .select('pilote_id, temps_prev_min, accepted_at, demande_cloture_at, cloture_at')
      .eq('compagnie_id', selectedCompagnieOption.id)
      .eq('statut', 'cloture')
      .in('pilote_id', employeIds);

    (plansVol || []).forEach(p => {
      if (p.pilote_id) {
        // Calculer le temps réel de vol
        let tempsMinutes = p.temps_prev_min || 0;
        if (p.accepted_at && (p.demande_cloture_at || p.cloture_at)) {
          const debut = new Date(p.accepted_at);
          const fin = new Date(p.demande_cloture_at || p.cloture_at);
          const diffMs = fin.getTime() - debut.getTime();
          tempsMinutes = Math.max(1, Math.round(diffMs / 60000));
        }
        heuresParPilote[p.pilote_id] = (heuresParPilote[p.pilote_id] || 0) + tempsMinutes;
      }
    });
  }

  // Flotte avec disponibilité
  const { data: flotte } = await admin.from('compagnie_flotte')
    .select('*, types_avion(nom, code_oaci)')
    .eq('compagnie_id', selectedCompagnieOption.id);

  const flotteWithStatus = await Promise.all((flotte || []).map(async (item) => {
    const { count } = await admin.from('plans_vol')
      .select('*', { count: 'exact', head: true })
      .eq('flotte_avion_id', item.id)
      .in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture']);
    
    return {
      ...item,
      en_vol: count || 0,
      disponibles: item.quantite - (count || 0)
    };
  }));

  const isPdg = compagnie?.pdg_id === user.id;

  // Récupérer le solde de la compagnie (compte entreprise)
  let soldeCompagnie = 0;
  if (isPdg && compagnie) {
    const { data: compteEntreprise } = await admin.from('felitz_comptes')
      .select('solde')
      .eq('compagnie_id', compagnie.id)
      .eq('type', 'entreprise')
      .single();
    soldeCompagnie = compteEntreprise?.solde || 0;
  }

  // Préparer les données pour le client
  const employesData = (employes || []).map(emp => {
    const pData = emp.profiles;
    const pilote = pData ? (Array.isArray(pData) ? pData[0] : pData) as { id: string; identifiant: string } | null : null;
    return {
      id: emp.id,
      piloteId: pilote?.id || '',
      identifiant: pilote?.identifiant || '—',
      heures: pilote ? heuresParPilote[pilote.id] || 0 : 0
    };
  });

  const flotteData = flotteWithStatus.map(item => {
    const taData = item.types_avion;
    const taObj = taData ? (Array.isArray(taData) ? taData[0] : taData) as { nom: string; code_oaci: string | null } | null : null;
    return {
      id: item.id,
      nom: item.nom_personnalise || taObj?.nom || '—',
      code_oaci: taObj?.code_oaci || null,
      quantite: item.quantite,
      en_vol: item.en_vol,
      disponibles: item.disponibles
    };
  });

  const pdgIdentifiant = (() => {
    const p = compagnie?.profiles;
    const pObj = p ? (Array.isArray(p) ? p[0] : p) : null;
    return (pObj as { identifiant: string } | null)?.identifiant || 'Non défini';
  })();

  return (
    <MaCompagnieClient
      compagniesDisponibles={compagniesDisponibles}
      selectedCompagnieId={selectedCompagnieOption.id}
      compagnie={{
        id: compagnie?.id || '',
        nom: compagnie?.nom || '',
        code_oaci: compagnie?.code_oaci || null,
        vban: compagnie?.vban || null,
        pdg_identifiant: pdgIdentifiant,
        pourcentage_salaire: compagnie?.pourcentage_salaire || 20,
        prix_billet_pax: compagnie?.prix_billet_pax || 100,
        prix_kg_cargo: compagnie?.prix_kg_cargo || 5,
      }}
      employes={employesData}
      flotte={flotteData}
      isPdg={isPdg}
      soldeCompagnie={soldeCompagnie}
    />
  );
}
