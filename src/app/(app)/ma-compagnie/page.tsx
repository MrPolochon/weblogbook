import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import MaCompagnieClient from './MaCompagnieClient';

export default async function MaCompagniePage({ searchParams }: { searchParams: { c?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Single batch: employee records (with role) + PDG companies
  const [{ data: emplois }, { data: compagniesPdg }] = await Promise.all([
    admin.from('compagnie_employes')
      .select('compagnie_id, role, compagnies(id, nom)')
      .eq('pilote_id', user.id),
    admin.from('compagnies')
      .select('id, nom')
      .eq('pdg_id', user.id),
  ]);

  type CompagnieOption = { id: string; nom: string; role: 'employe' | 'pdg' | 'co_pdg' };
  const compagniesMap = new Map<string, CompagnieOption>();

  const coPdgCompIds = new Set(
    (emplois || []).filter(e => e.role === 'co_pdg').map(e => e.compagnie_id)
  );

  (emplois || []).forEach(e => {
    const c = e.compagnies;
    const cObj = c ? (Array.isArray(c) ? c[0] : c) as { id: string; nom: string } : null;
    if (cObj && !compagniesMap.has(cObj.id)) {
      const role = coPdgCompIds.has(cObj.id) ? 'co_pdg' : 'employe';
      compagniesMap.set(cObj.id, { ...cObj, role });
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

  const selectedId = searchParams.c || compagniesDisponibles[0].id;
  const selectedCompagnieOption = compagniesDisponibles.find(c => c.id === selectedId) || compagniesDisponibles[0];

  // Company details + employees in parallel
  const [{ data: compagnie }, { data: employes }] = await Promise.all([
    admin.from('compagnies')
      .select('*, profiles!compagnies_pdg_id_fkey(identifiant)')
      .eq('id', selectedCompagnieOption.id)
      .single(),
    admin.from('compagnie_employes')
      .select('*, profiles(id, identifiant)')
      .eq('compagnie_id', selectedCompagnieOption.id),
  ]);

  const employeIds = (employes || []).map(e => {
    const p = e.profiles;
    const pObj = p ? (Array.isArray(p) ? p[0] : p) : null;
    return (pObj as { id: string } | null)?.id;
  }).filter(Boolean);
  
  const isPdg = compagnie?.pdg_id === user.id;
  const isCoPdgUser = coPdgCompIds.has(selectedCompagnieOption.id);
  const isLeader = isPdg || isCoPdgUser;

  // Flight hours (vols + plans_vol) + company balance in parallel
  const heuresParPilote: Record<string, number> = {};

  const [volsResult, plansVolResult, soldeResult] = await Promise.all([
    employeIds.length > 0
      ? admin.from('vols')
          .select('pilote_id, duree_minutes')
          .eq('compagnie_id', selectedCompagnieOption.id)
          .eq('statut', 'validé')
          .in('pilote_id', employeIds)
      : Promise.resolve({ data: null }),
    employeIds.length > 0
      ? admin.from('plans_vol')
          .select('pilote_id, temps_prev_min, accepted_at, demande_cloture_at, cloture_at')
          .eq('compagnie_id', selectedCompagnieOption.id)
          .eq('statut', 'cloture')
          .in('pilote_id', employeIds)
      : Promise.resolve({ data: null }),
    isLeader && compagnie
      ? admin.from('felitz_comptes')
          .select('solde')
          .eq('compagnie_id', compagnie.id)
          .eq('type', 'entreprise')
          .single()
      : Promise.resolve({ data: null }),
  ]);

  (volsResult?.data || []).forEach((v: { pilote_id?: string; duree_minutes?: number }) => {
    if (v.pilote_id) {
      heuresParPilote[v.pilote_id] = (heuresParPilote[v.pilote_id] || 0) + (v.duree_minutes || 0);
    }
  });

  (plansVolResult?.data || []).forEach((p: { pilote_id?: string; temps_prev_min?: number; accepted_at?: string; demande_cloture_at?: string; cloture_at?: string }) => {
    if (p.pilote_id) {
      let tempsMinutes = p.temps_prev_min || 0;
      if (p.accepted_at && (p.demande_cloture_at || p.cloture_at)) {
        const debut = new Date(p.accepted_at);
        const fin = new Date(p.demande_cloture_at || p.cloture_at!);
        const diffMs = fin.getTime() - debut.getTime();
        tempsMinutes = Math.max(1, Math.round(diffMs / 60000));
      }
      heuresParPilote[p.pilote_id] = (heuresParPilote[p.pilote_id] || 0) + tempsMinutes;
    }
  });

  const soldeCompagnie = (soldeResult?.data as { solde?: number } | null)?.solde || 0;

  const employesData = (employes || []).map(emp => {
    const pData = emp.profiles;
    const pilote = pData ? (Array.isArray(pData) ? pData[0] : pData) as { id: string; identifiant: string } | null : null;
    return {
      id: emp.id,
      piloteId: pilote?.id || '',
      identifiant: pilote?.identifiant || '—',
      heures: pilote ? heuresParPilote[pilote.id] || 0 : 0,
      role: (emp.role as string) || 'employe',
    };
  });

  const pdgIdentifiant = (() => {
    const p = compagnie?.profiles;
    const pObj = p ? (Array.isArray(p) ? p[0] : p) : null;
    return (pObj as { identifiant: string } | null)?.identifiant || 'Non défini';
  })();

  return (
    <MaCompagnieClient
      key={selectedCompagnieOption.id}
      compagniesDisponibles={compagniesDisponibles}
      selectedCompagnieId={selectedCompagnieOption.id}
      compagnie={{
        id: compagnie?.id || '',
        nom: compagnie?.nom || '',
        code_oaci: compagnie?.code_oaci || null,
        callsign_telephonie: compagnie?.callsign_telephonie || null,
        vban: compagnie?.vban || null,
        pdg_identifiant: pdgIdentifiant,
        pourcentage_salaire: compagnie?.pourcentage_salaire || 20,
        prix_billet_pax: compagnie?.prix_billet_pax || 100,
        prix_kg_cargo: compagnie?.prix_kg_cargo || 5,
        logo_url: compagnie?.logo_url || null,
        alliance_id: compagnie?.alliance_id ?? null,
      }}
      employes={employesData}
      isPdg={isPdg}
      isLeader={isLeader}
      soldeCompagnie={soldeCompagnie}
    />
  );
}
