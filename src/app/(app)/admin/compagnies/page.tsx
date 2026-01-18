import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import CreateCompagnieForm from './CreateCompagnieForm';
import CompagniesList from './CompagniesList';

export default async function AdminCompagniesPage() {
  const supabase = await createClient();
  const { data: compagnies } = await supabase.from('compagnies').select('id, nom').order('nom');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Compagnies</h1>
      </div>
      <CreateCompagnieForm />
      <CompagniesList compagnies={compagnies || []} />
    </div>
  );
}
