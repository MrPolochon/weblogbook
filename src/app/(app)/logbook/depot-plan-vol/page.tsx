import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DepotPlanVolForm from './DepotPlanVolForm';

export default async function DepotPlanVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const [{ data: employe }, { data: inventairePersonnel }, { data: typesAvion }] = await Promise.all([
    supabase.from('compagnies_employes').select('compagnie_id, compagnies(id, nom)').eq('user_id', user.id).single(),
    supabase
      .from('inventaire_pilote')
      .select('id, type_avion_id, nom_avion, types_avion(nom, constructeur)')
      .eq('user_id', user.id),
    supabase.from('types_avion').select('id, nom, constructeur').order('ordre'),
  ]);

  // Récupérer les avions de la compagnie si l'utilisateur en a une
  let avionsCompagnie: { data: any[] | null } = { data: null };
  if (employe?.compagnie_id) {
    const result = await supabase
      .from('compagnies_avions')
      .select('id, type_avion_id, quantite, nom_avion, types_avion(nom, constructeur)')
      .eq('compagnie_id', employe.compagnie_id);
    avionsCompagnie = result;
  }

  const compagnieId = employe?.compagnie_id;
  const compagnieNom = employe ? (employe.compagnies as any).nom : null;

  const { data: avionsUtilises } = compagnieId
    ? await supabase
        .from('avions_utilisation')
        .select('compagnie_avion_id')
        .in('compagnie_avion_id', (avionsCompagnie?.data || []).map((a: any) => a.id))
    : { data: [] };

  const avionsDisponibles = (avionsCompagnie.data || []).filter((a: any) => {
    const utilise = (avionsUtilises || []).some((u: any) => u.compagnie_avion_id === a.id);
    return !utilise;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100">Déposer un plan de vol</h1>
      </div>
      <DepotPlanVolForm
        compagnieId={compagnieId}
        compagnieNom={compagnieNom}
        avionsCompagnie={avionsDisponibles.map((a: any) => ({
          id: a.id,
          typeAvionId: a.type_avion_id,
          nom: a.nom_avion || `${(a.types_avion as any).constructeur} ${(a.types_avion as any).nom}`,
        }))}
        inventairePersonnel={(inventairePersonnel || []).map((a: any) => ({
          id: a.id,
          typeAvionId: a.type_avion_id,
          nom: a.nom_avion || `${(a.types_avion as any).constructeur} ${(a.types_avion as any).nom}`,
        }))}
        typesAvion={(typesAvion || []).map((t) => ({ id: t.id, nom: `${t.constructeur} ${t.nom}` }))}
      />
    </div>
  );
}
