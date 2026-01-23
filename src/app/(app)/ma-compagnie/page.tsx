import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Building2, Users, Plane, Crown, Clock } from 'lucide-react';
import Link from 'next/link';

function formatHeures(minutes: number | null | undefined): string {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default async function MaCompagniePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Trouver la compagnie de l'utilisateur (employé ou PDG)
  const { data: emploi } = await admin.from('compagnie_employes')
    .select('compagnie_id')
    .eq('pilote_id', user.id)
    .single();

  const { data: pdgCompagnie } = await admin.from('compagnies')
    .select('id')
    .eq('pdg_id', user.id)
    .single();

  const compagnieId = emploi?.compagnie_id || pdgCompagnie?.id;

  if (!compagnieId) {
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

  // Récupérer les infos de la compagnie
  const { data: compagnie } = await admin.from('compagnies')
    .select('*, profiles!compagnies_pdg_id_fkey(identifiant)')
    .eq('id', compagnieId)
    .single();

  // Liste des employés avec leurs heures de vol pour cette compagnie
  const { data: employes } = await admin.from('compagnie_employes')
    .select('*, profiles(id, identifiant)')
    .eq('compagnie_id', compagnieId);

  // Calculer les heures de vol par pilote pour cette compagnie
  const employeIds = (employes || []).map(e => {
    const p = e.profiles;
    const pObj = p ? (Array.isArray(p) ? p[0] : p) : null;
    return (pObj as { id: string } | null)?.id;
  }).filter(Boolean);
  
  const heuresParPilote: Record<string, number> = {};
  if (employeIds.length > 0) {
    const { data: vols } = await admin.from('vols')
      .select('pilote_id, duree_minutes')
      .eq('compagnie_id', compagnieId)
      .eq('statut', 'valide')
      .in('pilote_id', employeIds);

    (vols || []).forEach(v => {
      if (v.pilote_id) {
        heuresParPilote[v.pilote_id] = (heuresParPilote[v.pilote_id] || 0) + (v.duree_minutes || 0);
      }
    });
  }

  // Flotte avec disponibilité
  const { data: flotte } = await admin.from('compagnie_flotte')
    .select('*, types_avion(nom, code_oaci)')
    .eq('compagnie_id', compagnieId);

  // Compter avions en vol
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Building2 className="h-8 w-8 text-sky-400" />
          {compagnie?.nom || 'Ma compagnie'}
        </h1>
        {isPdg && (
          <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-full text-sm font-medium">
            <Crown className="h-4 w-4" />
            PDG
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Infos compagnie */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-400" />
            Informations
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-400">Nom</p>
              <p className="text-slate-200 font-medium">{compagnie?.nom}</p>
            </div>
            {compagnie?.code_oaci && (
              <div>
                <p className="text-sm text-slate-400">Code OACI</p>
                <p className="text-slate-200 font-mono">{compagnie.code_oaci}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-slate-400">PDG</p>
              <p className="text-slate-200 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" />
                {(() => {
                  const p = compagnie?.profiles;
                  const pObj = p ? (Array.isArray(p) ? p[0] : p) : null;
                  return (pObj as { identifiant: string } | null)?.identifiant || 'Non défini';
                })()}
              </p>
            </div>
            {compagnie?.vban && (
              <div>
                <p className="text-sm text-slate-400">VBAN Entreprise</p>
                <p className="text-slate-200 font-mono text-sm break-all">{compagnie.vban}</p>
              </div>
            )}
          </div>
        </div>

        {/* Liste des pilotes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-400" />
            Pilotes ({employes?.length || 0})
          </h2>
          {employes && employes.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {employes.map((emp) => {
                const pData = emp.profiles;
                const pilote = pData ? (Array.isArray(pData) ? pData[0] : pData) as { id: string; identifiant: string } | null : null;
                const heures = pilote ? heuresParPilote[pilote.id] || 0 : 0;
                return (
                  <div 
                    key={emp.id} 
                    className="flex items-center justify-between bg-slate-800/30 rounded-lg p-3 border border-slate-700/30"
                  >
                    <span className="text-slate-200 font-medium">{pilote?.identifiant || '—'}</span>
                    <span className="text-sm text-slate-400 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatHeures(heures)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Aucun pilote employé.</p>
          )}
        </div>
      </div>

      {/* Flotte */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Flotte ({flotteWithStatus.length} types d&apos;appareil)
        </h2>
        {flotteWithStatus.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="pb-2 pr-4">Appareil</th>
                  <th className="pb-2 pr-4">Quantité</th>
                  <th className="pb-2 pr-4">En vol</th>
                  <th className="pb-2">Disponibles</th>
                </tr>
              </thead>
              <tbody>
                {flotteWithStatus.map((item) => {
                  const taData = item.types_avion;
                  const taObj = taData ? (Array.isArray(taData) ? taData[0] : taData) as { nom: string; code_oaci: string | null } | null : null;
                  return (
                  <tr key={item.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="text-slate-200 font-medium">
                        {item.nom_personnalise || taObj?.nom || '—'}
                      </span>
                      {taObj?.code_oaci && (
                        <span className="ml-2 text-xs text-slate-500 font-mono">
                          ({taObj.code_oaci})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{item.quantite}</td>
                    <td className="py-2.5 pr-4">
                      {item.en_vol > 0 ? (
                        <span className="text-amber-400">{item.en_vol}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className={item.disponibles > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {item.disponibles}
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Aucun appareil dans la flotte.</p>
        )}
      </div>

      {/* Lien vers Felitz Bank si PDG */}
      {isPdg && (
        <Link 
          href="/felitz-bank"
          className="card hover:bg-slate-800/70 transition-colors flex items-center gap-4"
        >
          <div className="p-3 rounded-lg bg-emerald-500/20">
            <Building2 className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Gérer les finances</p>
            <p className="text-sm text-slate-400">Accéder au compte Felitz Bank de la compagnie</p>
          </div>
        </Link>
      )}
    </div>
  );
}
