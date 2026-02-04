import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Landmark, User, Building2, Shield } from 'lucide-react';
import Link from 'next/link';
import AdminFelitzClient from './AdminFelitzClient';

export default async function AdminFelitzBankPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();

  // Comptes personnels
  const { data: comptesPerso } = await admin.from('felitz_comptes')
    .select('*, profiles(identifiant)')
    .eq('type', 'personnel')
    .order('solde', { ascending: false });

  // Comptes entreprises
  const { data: comptesEntreprise } = await admin.from('felitz_comptes')
    .select('*, compagnies(nom)')
    .eq('type', 'entreprise')
    .order('solde', { ascending: false });

  // Compte militaire
  const { data: compteMilitaire } = await admin.from('felitz_comptes')
    .select('*, profiles:proprietaire_id(identifiant)')
    .eq('type', 'militaire')
    .single();

  // Extraire le PDG militaire
  const pdgMilitaire = compteMilitaire?.profiles 
    ? (Array.isArray(compteMilitaire.profiles) ? compteMilitaire.profiles[0] : compteMilitaire.profiles) 
    : null;

  // Transactions récentes pour TOUS les comptes (admin)
  const comptesIdsAll = [
    ...(comptesPerso || []).map(c => c.id),
    ...(comptesEntreprise || []).map(c => c.id),
    ...(compteMilitaire ? [compteMilitaire.id] : []),
  ];
  let transactionsByCompte: Record<string, Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }>> = {};
  if (comptesIdsAll.length > 0) {
    const { data: allTransactions } = await admin.from('felitz_transactions')
      .select('id, compte_id, type, montant, libelle, description, created_at')
      .in('compte_id', comptesIdsAll)
      .order('created_at', { ascending: false })
      .limit(600);

    (allTransactions || []).forEach((t) => {
      if (!transactionsByCompte[t.compte_id]) {
        transactionsByCompte[t.compte_id] = [];
      }
      if (transactionsByCompte[t.compte_id].length < 20) {
        transactionsByCompte[t.compte_id].push({
          id: t.id,
          type: t.type,
          montant: t.montant,
          libelle: t.libelle,
          description: (t as { description?: string | null }).description ?? null,
          created_at: t.created_at,
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Landmark className="h-7 w-7 text-emerald-400" />
          Felitz Bank Admin
        </h1>
      </div>

      {/* Compte Militaire (si existant) */}
      {compteMilitaire && (
        <div className="card border-red-500/30 bg-red-500/5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-400" />
            Compte Armée
            {pdgMilitaire && (
              <span className="text-sm font-normal text-slate-400">
                (PDG: {(pdgMilitaire as { identifiant: string }).identifiant})
              </span>
            )}
          </h2>
          <AdminFelitzClient 
            compte={compteMilitaire}
            label="Armée"
            type="militaire"
            transactions={transactionsByCompte[compteMilitaire.id] || []}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comptes personnels */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-emerald-400" />
            Comptes personnels ({comptesPerso?.length || 0})
          </h2>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {comptesPerso?.map((compte) => {
              const profilesData = compte.profiles;
              const profileObj = profilesData ? (Array.isArray(profilesData) ? profilesData[0] : profilesData) : null;
              return (
                <AdminFelitzClient 
                  key={compte.id}
                  compte={compte}
                  label={(profileObj as { identifiant: string } | null)?.identifiant || 'Inconnu'}
                  type="personnel"
                  transactions={transactionsByCompte[compte.id] || []}
                />
              );
            })}
          </div>
        </div>

        {/* Comptes entreprises */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-400" />
            Comptes entreprises ({comptesEntreprise?.length || 0})
          </h2>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {comptesEntreprise?.map((compte) => {
              const compagniesData = compte.compagnies;
              const compagnieObj = compagniesData ? (Array.isArray(compagniesData) ? compagniesData[0] : compagniesData) : null;
              return (
                <AdminFelitzClient 
                  key={compte.id}
                  compte={compte}
                  label={(compagnieObj as { nom: string } | null)?.nom || 'Compagnie'}
                  type="entreprise"
                  transactions={transactionsByCompte[compte.id] || []}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
