import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import AdminTaxesAeroports from './AdminTaxesAeroports';

export default async function AdminTaxesAeroportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const { data: taxes } = await supabase
    .from('taxes_aeroports')
    .select('code_aeroport, taxe_base_pourcent, taxe_vfr_pourcent')
    .order('code_aeroport');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          Taxes aéroportuaires
        </h1>
      </div>
      <AdminTaxesAeroports taxes={taxes || []} />
    </div>
  );
}
