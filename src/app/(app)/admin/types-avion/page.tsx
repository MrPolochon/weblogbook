import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plane } from 'lucide-react';
import TypesAvionClient from './TypesAvionClient';

export default async function AdminTypesAvionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();
  const { data: types } = await admin.from('types_avion')
    .select('id, nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre')
    .order('ordre');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Plane className="h-7 w-7 text-sky-400" />
          Types d&apos;avion &amp; Prix
        </h1>
      </div>
      <div className="card">
        <p className="text-slate-400 text-sm mb-4">
          Définissez les prix de vente et capacités pour le marketplace et les vols commerciaux.
        </p>
        <TypesAvionClient types={types || []} />
      </div>
    </div>
  );
}
