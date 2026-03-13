import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Landmark, User, Building2, Shield, Users, Wrench } from 'lucide-react';
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

  // Comptes entreprises (compagnies aériennes)
  const { data: comptesEntreprise } = await admin.from('felitz_comptes')
    .select('*, compagnies(nom)')
    .eq('type', 'entreprise')
    .order('solde', { ascending: false });

  // Comptes alliances
  const { data: comptesAlliance } = await admin.from('felitz_comptes')
    .select('*, alliances(nom)')
    .eq('type', 'alliance')
    .order('solde', { ascending: false });

  // Comptes entreprises de réparation
  const { data: comptesReparation } = await admin.from('felitz_comptes')
    .select('*, entreprises_reparation(nom)')
    .eq('type', 'reparation')
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

  // Les transactions sont maintenant chargées de manière lazy par chaque composant AdminFelitzClient

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
                />
              );
            })}
          </div>
        </div>

        {/* Comptes alliances */}
        <div className="card border-violet-500/30">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-400" />
            Comptes alliances ({comptesAlliance?.length || 0})
          </h2>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(comptesAlliance || []).map((compte) => {
              const alliancesData = compte.alliances;
              const allianceObj = alliancesData ? (Array.isArray(alliancesData) ? alliancesData[0] : alliancesData) : null;
              return (
                <AdminFelitzClient 
                  key={compte.id}
                  compte={compte}
                  label={(allianceObj as { nom: string } | null)?.nom || 'Alliance'}
                  type="alliance"
                />
              );
            })}
          </div>
        </div>

        {/* Comptes entreprises de réparation */}
        <div className="card border-orange-500/30">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-400" />
            Comptes réparation ({comptesReparation?.length || 0})
          </h2>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(comptesReparation || []).map((compte) => {
              const reparData = compte.entreprises_reparation;
              const reparObj = reparData ? (Array.isArray(reparData) ? reparData[0] : reparData) : null;
              return (
                <AdminFelitzClient 
                  key={compte.id}
                  compte={compte}
                  label={(reparObj as { nom: string } | null)?.nom || 'Réparation'}
                  type="reparation"
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
