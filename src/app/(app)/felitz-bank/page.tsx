import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureComptePersonnel, getComptePersonnelCanonique } from '@/lib/felitz/ensure-comptes';
import { redirect } from 'next/navigation';
import { Landmark, Building2, Shield, Plane, Wallet, ArrowLeftRight, CreditCard } from 'lucide-react';
import FelitzBankClient from './FelitzBankClient';

type TxRow = { libelle?: string | null; [k: string]: unknown };

async function enrichTransactionsWithVban<T extends TxRow>(
  admin: ReturnType<typeof createAdminClient>,
  raw: T[]
): Promise<T[]> {
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const toResolve = new Set<string>();
  raw.forEach((t) => {
    (t.libelle || '').match(UUID_REGEX)?.forEach((u) => toResolve.add(u));
  });
  const vbanByUuid: Record<string, string> = {};
  if (toResolve.size > 0) {
    const ids = Array.from(toResolve);
    const { data: byId } = await admin.from('felitz_comptes').select('id, vban').in('id', ids);
    (byId || []).forEach((r: Record<string, string>) => { if (r.id) vbanByUuid[r.id] = r.vban; });
    const cols = ['compagnie_id', 'proprietaire_id', 'alliance_id', 'entreprise_reparation_id'] as const;
    for (const col of cols) {
      const { data: rows } = await admin.from('felitz_comptes').select(`${col}, vban`).in(col, ids);
      (rows || []).forEach((r: Record<string, string>) => {
        if (r[col]) vbanByUuid[r[col]] = r.vban;
      });
    }
  }
  return raw.map((t) => {
    let libelle = t.libelle || '';
    for (const [uuid, vban] of Object.entries(vbanByUuid)) {
      const escaped = uuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      libelle = libelle.replace(new RegExp(escaped, 'gi'), vban);
    }
    return { ...t, libelle };
  });
}

export default async function FelitzBankPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Récupérer le profil
  const { data: profile } = await supabase.from('profiles').select('role, identifiant').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';

  // Compte personnel référent (created_at le plus ancien si doublons ; création si manquant)
  await ensureComptePersonnel(admin, user.id);
  const comptePersoCanon = await getComptePersonnelCanonique(admin, user.id);
  const { data: comptePerso } = comptePersoCanon
    ? await admin.from('felitz_comptes').select('*').eq('id', comptePersoCanon.id).maybeSingle()
    : { data: null };

  // Compagnies dont l'utilisateur est PDG ou co-PDG
  const { data: compagniesPdg } = await admin.from('compagnies')
    .select('id, nom, vban')
    .eq('pdg_id', user.id);
  const { data: coPdgEmps } = await admin.from('compagnie_employes')
    .select('compagnie_id')
    .eq('pilote_id', user.id)
    .eq('role', 'co_pdg');
  const coPdgIds = (coPdgEmps || []).map(e => e.compagnie_id);
  let compagniesCoPdg: Array<{ id: string; nom: string; vban: string | null }> = [];
  if (coPdgIds.length > 0) {
    const { data } = await admin.from('compagnies').select('id, nom, vban').in('id', coPdgIds);
    compagniesCoPdg = data || [];
  }
  const allLeaderComps = [...(compagniesPdg || []), ...compagniesCoPdg];

  // Comptes entreprises
  let comptesEntreprise: Array<{ id: string; vban: string; solde: number; compagnie_id: string; compagnies: { nom: string } | null }> = [];
  if (allLeaderComps.length > 0) {
    const compagnieIds = allLeaderComps.map(c => c.id);
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

    const allTx = (data || []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      type: t.type as string,
      montant: t.montant as number,
      libelle: t.libelle as string,
      description: (t.description as string | null) ?? null,
      created_at: t.created_at as string,
      compte_id: t.compte_id as string,
    }));
    const enriched = await enrichTransactionsWithVban(admin, allTx);
    enriched.forEach((t) => {
      const cid = t.compte_id as string;
      if (!transactionsEntrepriseByCompte[cid]) transactionsEntrepriseByCompte[cid] = [];
      if (transactionsEntrepriseByCompte[cid].length < 100) {
        transactionsEntrepriseByCompte[cid].push({
          id: t.id,
          type: t.type,
          montant: t.montant,
          libelle: t.libelle,
          description: t.description,
          created_at: t.created_at,
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
    transactionsPerso = await enrichTransactionsWithVban(admin, data || []);
  }

  // Transactions pour le compte militaire
  let transactionsMilitaire: Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }> = [];
  if (compteMilitaire) {
    const { data } = await admin.from('felitz_transactions')
      .select('*')
      .eq('compte_id', compteMilitaire.id)
      .order('created_at', { ascending: false })
      .limit(100);
    transactionsMilitaire = await enrichTransactionsWithVban(admin, data || []);
  }

  const totalSolde = (comptePerso?.solde ?? 0) + comptesEntreprise.reduce((s, c) => s + c.solde, 0) + (compteMilitaire?.solde ?? 0);
  const nbComptes = (comptePerso ? 1 : 0) + comptesEntreprise.length + (compteMilitaire ? 1 : 0);
  const nbTransactions = transactionsPerso.length + Object.values(transactionsEntrepriseByCompte).reduce((s, t) => s + t.length, 0) + transactionsMilitaire.length;

  return (
    <div className="space-y-6 animate-page-reveal">
      {/* HUD Header */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-950/95 shadow-[0_22px_42px_rgba(2,6,23,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-60" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />
        <Plane
          className="pointer-events-none absolute top-3 -left-10 h-5 w-5 text-emerald-400/40 animate-plane-glide"
          style={{ animationDuration: '7s' }}
          aria-hidden
        />
        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
              <Landmark className="h-7 w-7 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-50 tracking-tight">Felitz Bank</h1>
              <p className="text-sm text-slate-400 mt-0.5">Gérez vos comptes, effectuez des virements</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Wallet className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-300 font-medium">{totalSolde.toLocaleString('fr-FR')} F$ total</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
              <CreditCard className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-sky-300 font-medium">{nbComptes} compte{nbComptes > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <ArrowLeftRight className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-purple-300 font-medium">{nbTransactions} transaction{nbTransactions > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Compte Personnel */}
        <div className="rounded-2xl border border-emerald-500/15 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-emerald-500/10 bg-emerald-500/5">
            <div className="p-2 rounded-lg bg-emerald-500/15">
              <Landmark className="h-4 w-4 text-emerald-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-100">Compte Personnel</h2>
          </div>

          {comptePerso ? (
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-800/60">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">VBAN</span>
                <span className="font-mono text-slate-300 text-xs break-all">{comptePerso.vban}</span>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-5">
                <p className="text-xs text-emerald-400/80 uppercase tracking-wider font-medium mb-1">Solde disponible</p>
                <p className="text-3xl font-bold text-emerald-300 tabular-nums">
                  {comptePerso.solde.toLocaleString('fr-FR')} <span className="text-lg text-emerald-400/60">F$</span>
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
            <div className="p-8 text-center">
              <Landmark className="h-8 w-8 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">Aucun compte personnel trouvé.</p>
            </div>
          )}
        </div>

        {/* Comptes Entreprise */}
        {comptesEntreprise.length > 0 && (
          <div className="rounded-2xl border border-sky-500/15 bg-slate-900/60 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-sky-500/10 bg-sky-500/5">
              <div className="p-2 rounded-lg bg-sky-500/15">
                <Building2 className="h-4 w-4 text-sky-400" />
              </div>
              <h2 className="text-base font-semibold text-slate-100">Comptes Entreprise</h2>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/20">
                PDG
              </span>
            </div>

            <div className="p-5 space-y-5">
              {comptesEntreprise.map((compte) => (
                <div key={compte.id} className="rounded-xl border border-slate-800/50 bg-slate-800/20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40">
                    <span className="font-semibold text-slate-200 text-sm">{compte.compagnies?.nom || 'Compagnie'}</span>
                    <span className="font-mono text-[10px] text-slate-500 break-all">{compte.vban}</span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-2xl font-bold text-sky-300 tabular-nums">
                      {compte.solde.toLocaleString('fr-FR')} <span className="text-sm text-sky-400/60">F$</span>
                    </p>
                  </div>
                  <div className="px-4 pb-4">
                    <FelitzBankClient
                      compteId={compte.id}
                      solde={compte.solde}
                      transactions={transactionsEntrepriseByCompte[compte.id] || []}
                      isAdmin={isAdmin}
                      isEntreprise
                      compagnieNom={compte.compagnies?.nom}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Compte Militaire */}
        {compteMilitaire && (
          <div className="rounded-2xl border border-red-500/15 bg-slate-900/60 backdrop-blur-sm overflow-hidden lg:col-span-2">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-red-500/10 bg-red-500/5">
              <div className="p-2 rounded-lg bg-red-500/15">
                <Shield className="h-4 w-4 text-red-400" />
              </div>
              <h2 className="text-base font-semibold text-slate-100">Compte de l&apos;Armée</h2>
              <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/20">
                PDG Militaire
              </span>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 p-5">
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-red-500/10">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">VBAN</span>
                  <span className="font-mono text-slate-300 text-xs break-all">{compteMilitaire.vban}</span>
                </div>

                <div className="rounded-xl bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 p-5">
                  <p className="text-xs text-red-400/80 uppercase tracking-wider font-medium mb-1">Solde disponible</p>
                  <p className="text-3xl font-bold text-red-300 tabular-nums">
                    {compteMilitaire.solde.toLocaleString('fr-FR')} <span className="text-lg text-red-400/60">F$</span>
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

              <div className="rounded-xl border border-slate-800/50 bg-slate-800/20 p-4">
                <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Transactions récentes</h3>
                {transactionsMilitaire.length > 0 ? (
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                    {transactionsMilitaire.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-sm py-2 px-2 rounded-lg hover:bg-slate-800/40 transition-colors">
                        <span className="text-slate-400 truncate flex-1 text-xs">{t.libelle || t.description || '—'}</span>
                        <span className={`font-medium tabular-nums text-xs ${t.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.type === 'credit' ? '+' : '-'}{Math.abs(t.montant).toLocaleString('fr-FR')} F$
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 text-sm text-center py-4">Aucune transaction</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
