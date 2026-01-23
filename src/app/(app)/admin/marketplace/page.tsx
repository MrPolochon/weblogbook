import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import AdminMarketplace from './AdminMarketplace';

export default async function AdminMarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const [{ data: typesAvion }, { data: marketplace }] = await Promise.all([
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
    supabase.from('marketplace_avions').select('type_avion_id, prix, capacite_cargo_kg'),
  ]);

  const prixByType = new Map((marketplace || []).map((m: any) => [m.type_avion_id, m]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          Marketplace
        </h1>
      </div>
      <AdminMarketplace
        typesAvion={(typesAvion || []).map((t) => ({
          id: t.id,
          nom: `${t.constructeur} ${t.nom}`,
          prix: prixByType.get(t.id)?.prix || null,
          capaciteCargo: prixByType.get(t.id)?.capacite_cargo_kg || null,
        }))}
      />
    </div>
  );
}
