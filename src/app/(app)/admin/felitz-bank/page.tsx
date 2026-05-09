import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Landmark, User, Building2, Shield, Users, Wrench } from 'lucide-react';
import Link from 'next/link';
import AdminFelitzClient from './AdminFelitzClient';
import AdminFelitzSection from './AdminFelitzSection';

export default async function AdminFelitzBankPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();

  // Toutes les requêtes Felitz en parallèle (au lieu de 5 awaits séquentiels).
  // maybeSingle() pour le compte militaire : ne lève pas d'exception si absent.
  const [
    { data: comptesPerso },
    { data: comptesEntreprise },
    { data: comptesAlliance },
    { data: comptesReparation },
    { data: compteMilitaire },
  ] = await Promise.all([
    admin.from('felitz_comptes').select('*, profiles(identifiant)').eq('type', 'personnel').order('solde', { ascending: false }),
    admin.from('felitz_comptes').select('*, compagnies(nom)').eq('type', 'entreprise').order('solde', { ascending: false }),
    admin.from('felitz_comptes').select('*, alliances(nom)').eq('type', 'alliance').order('solde', { ascending: false }),
    admin.from('felitz_comptes').select('*, entreprises_reparation(nom)').eq('type', 'reparation').order('solde', { ascending: false }),
    admin.from('felitz_comptes').select('*, profiles:proprietaire_id(identifiant)').eq('type', 'militaire').maybeSingle(),
  ]);

  // Extraire le PDG militaire
  const pdgMilitaire = compteMilitaire?.profiles 
    ? (Array.isArray(compteMilitaire.profiles) ? compteMilitaire.profiles[0] : compteMilitaire.profiles) 
    : null;

  // Précalcul des labels côté serveur pour passer au composant de section
  // (qui gère ensuite la recherche/filtrage côté client).
  const pickFirst = <T,>(v: T | T[] | null | undefined): T | null =>
    v ? (Array.isArray(v) ? v[0] ?? null : v) : null;

  const persoEntries = (comptesPerso || []).map((c) => ({
    id: c.id,
    vban: c.vban,
    solde: c.solde,
    label: pickFirst<{ identifiant: string }>(c.profiles)?.identifiant || 'Inconnu',
  }));
  const entrepriseEntries = (comptesEntreprise || []).map((c) => ({
    id: c.id,
    vban: c.vban,
    solde: c.solde,
    label: pickFirst<{ nom: string }>(c.compagnies)?.nom || 'Compagnie',
  }));
  const allianceEntries = (comptesAlliance || []).map((c) => ({
    id: c.id,
    vban: c.vban,
    solde: c.solde,
    label: pickFirst<{ nom: string }>(c.alliances)?.nom || 'Alliance',
  }));
  const reparationEntries = (comptesReparation || []).map((c) => ({
    id: c.id,
    vban: c.vban,
    solde: c.solde,
    label: pickFirst<{ nom: string }>(c.entreprises_reparation)?.nom || 'Réparation',
  }));

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
            Comptes personnels ({persoEntries.length})
          </h2>
          <AdminFelitzSection
            comptes={persoEntries}
            type="personnel"
            searchPlaceholder="Rechercher un identifiant ou VBAN..."
          />
        </div>

        {/* Comptes entreprises */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-400" />
            Comptes entreprises ({entrepriseEntries.length})
          </h2>
          <AdminFelitzSection
            comptes={entrepriseEntries}
            type="entreprise"
            searchPlaceholder="Rechercher une compagnie ou VBAN..."
          />
        </div>

        {/* Comptes alliances */}
        <div className="card border-violet-500/30">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-400" />
            Comptes alliances ({allianceEntries.length})
          </h2>
          <AdminFelitzSection
            comptes={allianceEntries}
            type="alliance"
            searchPlaceholder="Rechercher une alliance ou VBAN..."
          />
        </div>

        {/* Comptes entreprises de réparation */}
        <div className="card border-orange-500/30">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-400" />
            Comptes réparation ({reparationEntries.length})
          </h2>
          <AdminFelitzSection
            comptes={reparationEntries}
            type="reparation"
            searchPlaceholder="Rechercher une entreprise ou VBAN..."
          />
        </div>
      </div>
    </div>
  );
}
