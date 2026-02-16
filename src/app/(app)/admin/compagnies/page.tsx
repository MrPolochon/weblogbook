import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import CreateCompagnieForm from './CreateCompagnieForm';
import CompagniesList from './CompagniesList';

export default async function AdminCompagniesPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  
  const [{ data: compagnies }, { data: pilotes }] = await Promise.all([
    admin.from('compagnies')
      .select('id, nom, pdg_id, prix_billet_pax, prix_kg_cargo, pourcentage_salaire, vban, code_oaci, callsign_telephonie, profiles!compagnies_pdg_id_fkey(identifiant)')
      .order('nom'),
    admin.from('profiles')
      .select('id, identifiant')
      .in('role', ['pilote', 'admin'])
      .order('identifiant')
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
      <CompagniesList compagnies={compagnies || []} pilotes={pilotes || []} />
    </div>
  );
}
