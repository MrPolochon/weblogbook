import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import VolFormMilitaire from './VolFormMilitaire';

export default async function NouveauVolMilitairePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('armee, role, blocked_until').eq('id', user.id).single();
  if (!profile?.armee && profile?.role !== 'admin') redirect('/militaire');
  if (profile?.blocked_until && new Date(profile.blocked_until) > new Date()) redirect('/militaire');

  const { data: pilotesArmee } = await supabase
    .from('profiles')
    .select('id, identifiant')
    .eq('armee', true)
    .order('identifiant');

  const list = (pilotesArmee || []).filter((p) => p.id !== user.id);

  // Récupérer les avions militaires de l'inventaire personnel
  const admin = createAdminClient();
  const { data: inventaireMilitaire } = await admin.from('inventaire_avions')
    .select('*, types_avion(id, nom, code_oaci)')
    .eq('proprietaire_id', user.id);

  // Filtrer uniquement les avions militaires (via jointure)
  const { data: avionsMilitairesIds } = await admin.from('types_avion')
    .select('id')
    .eq('est_militaire', true);

  const militaireIds = new Set((avionsMilitairesIds || []).map(a => a.id));
  const inventaireMilitaireFiltre = (inventaireMilitaire || []).filter(inv => 
    militaireIds.has(inv.type_avion_id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/militaire" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Nouveau vol militaire</h1>
      </div>
      <VolFormMilitaire pilotesArmee={list} inventaireMilitaire={inventaireMilitaireFiltre} />
    </div>
  );
}
