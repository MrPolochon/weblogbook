import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import CreateCompagnieForm from './CreateCompagnieForm';
import CompagniesList from './CompagniesList';

export default async function AdminCompagniesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  
  const [{ data: compagnies }, { data: pilotes }, { data: typesAvion }] = await Promise.all([
    admin.from('compagnies')
      .select('id, nom, pdg_id, prix_billet_pax, prix_kg_cargo, pourcentage_salaire, vban, profiles!compagnies_pdg_id_fkey(identifiant)')
      .order('nom'),
    admin.from('profiles')
      .select('id, identifiant')
      .in('role', ['pilote', 'admin'])
      .order('identifiant'),
    admin.from('types_avion')
      .select('id, nom, code_oaci, categorie, est_militaire, est_cargo, capacite_pax, capacite_cargo_kg')
      .eq('est_militaire', false)
      .order('nom')
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Building2 className="h-7 w-7 text-sky-400" />
          Compagnies
        </h1>
      </div>
      <CreateCompagnieForm pilotes={pilotes || []} />
      <CompagniesList compagnies={compagnies || []} pilotes={pilotes || []} typesAvion={typesAvion || []} />
    </div>
  );
}
