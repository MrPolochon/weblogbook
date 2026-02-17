import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { Landmark, Building2, Shield } from 'lucide-react';
import FelitzBankClient from './FelitzBankClient';

export default async function FelitzBankPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Récupérer le profil
  const { data: profile } = await supabase.from('profiles').select('role, identifiant').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  // Compte personnel
  const { data: comptePerso } = await admin.from('felitz_comptes')
    .select('*')
    .eq('proprietaire_id', user.id)
    .eq('type', 'personnel')
    .single();

  // Compagnies dont l'utilisateur est PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom, vban')
    .eq('pdg_id', user.id);

  // Comptes entreprises
  let comptesEntreprise: Array<{ id: string; vban: string; solde: number; compagnie_id: string; compagnies: { nom: string } | null }> = [];
  if (compagniesPdg && compagniesPdg.length > 0) {
    const compagnieIds = compagniesPdg.map(c => c.id);
    const { data } = await admin.from('felitz_comptes')
      .select('*, compagnies(nom)')
      .eq('type', 'entreprise')
      .in('compagnie_id', compagnieIds);
    comptesEntreprise = data || [];
  }

  // Transactions récentes pour les comptes entreprise
  let transactionsEntrepriseByCompte: Record<string, Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }>> = {};
  if (comptesEntreprise.length > 0) {
    const compteIds = comptesEntreprise.map(c => c.id);
    const { data } = await admin.from('felitz_transactions')
      .select('*')
      .in('compte_id', compteIds)
      .order('created_at', { ascending: false })
      .limit(1000);

    (data || []).forEach((t: Record<string, unknown>) => {
      const cid = t.compte_id as string;
      if (!transactionsEntrepriseByCompte[cid]) {
        transactionsEntrepriseByCompte[cid] = [];
      }
      if (transactionsEntrepriseByCompte[cid].length < 100) {
        transactionsEntrepriseByCompte[cid].push({
          id: t.id as string,
          type: t.type as string,
          montant: t.montant as number,
          libelle: t.libelle as string,
          description: (t.description as string | null) ?? null,
          created_at: t.created_at as string,
        });
      }
    });
  }

  // Compte militaire (si l'utilisateur est PDG militaire)
  const { data: compteMilitaire } = await admin.from('felitz_comptes')
    .select('*')
    .eq('type', 'militaire')
    .eq('proprietaire_id', user.id)
    .single();

  // Transactions récentes pour le compte personnel
  let transactionsPerso: Array<{ id: string; type: string; montant: number; libelle: string; created_at: string }> = [];
  if (comptePerso) {
    const { data } = await admin.from('felitz_transactions')
      .select('*')
      .eq('compte_id', comptePerso.id)
      .order('created_at', { ascending: false })
      .limit(100);
    transactionsPerso = data || [];
  }

  // Transactions pour le compte militaire
  let transactionsMilitaire: Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }> = [];
  if (compteMilitaire) {
    const { data } = await admin.from('felitz_transactions')
      .select('*')
      .eq('compte_id', compteMilitaire.id)
      .order('created_at', { ascending: false })
      .limit(100);
    transactionsMilitaire = data || [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="h-8 w-8 text-emerald-400" />
        <h1 className="text-2xl font-bold text-slate-100">Felitz Bank</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compte Personnel */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Landmark className="h-5 w-5 text-emerald-400" />
            Compte Personnel
          </h2>
          
          {comptePerso ? (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <p className="text-sm text-slate-400">VBAN</p>
                <p className="font-mono text-slate-200 text-sm break-all">{comptePerso.vban}</p>
              </div>
              
              <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/30">
                <p className="text-sm text-emerald-400">Solde disponible</p>
                <p className="text-3xl font-bold text-emerald-300">
                  {comptePerso.solde.toLocaleString('fr-FR')} F$
                </p>
              </div>

              <FelitzBankClient 
                compteId={comptePerso.id}
                solde={comptePerso.solde}
                transactions={transactionsPerso}
                isAdmin={isAdmin}
              />
            </div>
          ) : (
            <p className="text-slate-400">Aucun compte personnel trouvé.</p>
          )}
        </div>

        {/* Comptes Entreprise (PDG uniquement) */}
        {comptesEntreprise.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-sky-400" />
              Comptes Entreprise (PDG)
            </h2>
            
            <div className="space-y-4">
              {comptesEntreprise.map((compte) => (
                <div key={compte.id} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="font-semibold text-slate-200 mb-2">{compte.compagnies?.nom || 'Compagnie'}</p>
                  <p className="text-xs text-slate-400 font-mono break-all mb-2">{compte.vban}</p>
                  <p className="text-2xl font-bold text-sky-300">
                    {compte.solde.toLocaleString('fr-FR')} F$
                  </p>
                  <FelitzBankClient 
                    compteId={compte.id}
                    solde={compte.solde}
                    transactions={transactionsEntrepriseByCompte[compte.id] || []}
                    isAdmin={isAdmin}
                    isEntreprise
                    compagnieNom={compte.compagnies?.nom}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compte Militaire (PDG Armée uniquement) */}
        {compteMilitaire && (
          <div className="card lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-400" />
              Compte de l&apos;Armée (PDG Militaire)
            </h2>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-4">
                <div className="bg-slate-800/50 rounded-lg p-4 border border-red-500/30">
                  <p className="text-sm text-slate-400">VBAN Armée</p>
                  <p className="font-mono text-slate-200 text-sm break-all">{compteMilitaire.vban}</p>
                </div>
                
                <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                  <p className="text-sm text-red-400">Solde disponible</p>
                  <p className="text-3xl font-bold text-red-300">
                    {compteMilitaire.solde.toLocaleString('fr-FR')} F$
                  </p>
                </div>

                <FelitzBankClient 
                  compteId={compteMilitaire.id}
                  solde={compteMilitaire.solde}
                  transactions={transactionsMilitaire}
                  isAdmin={isAdmin}
                  isMilitaire
                />
              </div>

              {/* Transactions militaires */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="font-medium text-slate-200 mb-3">Transactions récentes</h3>
                {transactionsMilitaire.length > 0 ? (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {transactionsMilitaire.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-700/30 last:border-0">
                        <span className="text-slate-400 truncate flex-1">{t.libelle || t.description || '—'}</span>
                        <span className={t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}>
                          {t.type === 'credit' ? '+' : '-'}{Math.abs(t.montant).toLocaleString('fr-FR')} F$
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">Aucune transaction</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
