import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Receipt } from 'lucide-react';
import Link from 'next/link';
import AdminTaxesClient from './AdminTaxesClient';

export default async function AdminTaxesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const admin = createAdminClient();

  // Liste des taxes
  const { data: taxes } = await admin.from('taxes_aeroport')
    .select('*')
    .order('code_oaci');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-3">
          <Receipt className="h-7 w-7 text-sky-400" />
          Taxes aéroportuaires
        </h1>
      </div>

      <div className="card">
        <p className="text-sm text-slate-400 mb-4">
          Définissez les taxes pour chaque aéroport. Par défaut : IFR 2%, VFR 5%.
          Les taxes s&apos;appliquent sur le revenu brut des vols commerciaux.
        </p>

        <AdminTaxesClient taxes={taxes || []} />
      </div>
    </div>
  );
}
