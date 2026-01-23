import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Plane } from 'lucide-react';
import InventaireContent from './InventaireContent';

export default async function InventairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/atc');

  const { data: inventaire } = await supabase
    .from('inventaire_pilote')
    .select('id, type_avion_id, nom_avion, created_at, types_avion(nom, constructeur)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
        <Plane className="h-6 w-6" />
        Mon inventaire
      </h1>
      <InventaireContent
        avions={(inventaire || []).map((a) => ({
          id: a.id,
          nom: a.nom_avion,
          type: `${(a.types_avion as any).constructeur} ${(a.types_avion as any).nom}`,
        }))}
      />
    </div>
  );
}
