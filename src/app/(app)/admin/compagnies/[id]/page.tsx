import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AdminCompagnieDetail from './AdminCompagnieDetail';

export default async function AdminCompagnieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/logbook');

  const [{ data: compagnie }, { data: pilotes }, { data: typesAvion }, { data: avions }] = await Promise.all([
    supabase.from('compagnies').select('id, nom, pdg_id, pourcentage_paie, profiles!compagnies_pdg_id_fkey(identifiant)').eq('id', id).single(),
    supabase.from('profiles').select('id, identifiant').order('identifiant'),
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
    supabase.from('compagnies_avions').select('id, type_avion_id, quantite, types_avion(nom, constructeur)').eq('compagnie_id', id),
  ]);

  const { data: employes } = await supabase
    .from('compagnies_employes')
    .select('user_id, heures_vol_compagnie_minutes, profiles(identifiant)')
    .eq('compagnie_id', id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/compagnies" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">{compagnie?.nom}</h1>
      </div>
      <AdminCompagnieDetail
        compagnieId={id}
        compagnieNom={compagnie?.nom}
        pdgId={compagnie?.pdg_id}
        pdgNom={(compagnie as any)?.profiles?.identifiant}
        pourcentagePaie={compagnie?.pourcentage_paie}
        pilotes={pilotes || []}
        employes={(employes || []).map((e) => ({
          id: e.user_id,
          identifiant: (e.profiles as any).identifiant,
          heures: e.heures_vol_compagnie_minutes,
        }))}
        typesAvion={typesAvion || []}
        avions={(avions || []).map((a) => ({
          id: a.id,
          typeAvionId: a.type_avion_id,
          typeNom: `${(a.types_avion as any).constructeur} ${(a.types_avion as any).nom}`,
          quantite: a.quantite,
        }))}
      />
    </div>
  );
}
