import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MaCompagnieContent from './MaCompagnieContent';

export default async function MaCompagniePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/atc');

  const { data: employe } = await supabase
    .from('compagnies_employes')
    .select('compagnie_id, heures_vol_compagnie_minutes, compagnies(id, nom, pdg_id, pourcentage_paie, profiles!compagnies_pdg_id_fkey(identifiant))')
    .eq('user_id', user.id)
    .single();

  if (!employe) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-slate-100">Ma compagnie</h1>
        <div className="card">
          <p className="text-slate-400">Vous n&apos;appartenez à aucune compagnie.</p>
        </div>
      </div>
    );
  }

  const [{ data: pilotes }, { data: avions }] = await Promise.all([
    supabase
      .from('compagnies_employes')
      .select('user_id, heures_vol_compagnie_minutes, profiles(identifiant, role)')
      .eq('compagnie_id', employe.compagnie_id),
    supabase
      .from('compagnies_avions')
      .select('id, type_avion_id, quantite, capacite_passagers, capacite_cargo_kg, nom_avion, prix_billet_base, prix_cargo_kg, types_avion(nom, constructeur)')
      .eq('compagnie_id', employe.compagnie_id),
  ]);

  const { data: avionsUtilises } = await supabase
    .from('avions_utilisation')
    .select('compagnie_avion_id, plans_vol(id, numero_vol, aeroport_depart, aeroport_arrivee)')
    .in('compagnie_avion_id', (avions || []).map((a) => a.id));

  const isPDG = (employe.compagnies as any).pdg_id === user.id;

  return (
    <MaCompagnieContent
      compagnieId={employe.compagnie_id}
      compagnieNom={(employe.compagnies as any).nom}
      pdgNom={(employe.compagnies as any).profiles?.identifiant}
      isPDG={isPDG}
      pourcentagePaie={(employe.compagnies as any).pourcentage_paie}
      pilotes={(pilotes || []).map((p) => ({
        identifiant: (p.profiles as any).identifiant,
        heures: p.heures_vol_compagnie_minutes,
        isPDG: (employe.compagnies as any).pdg_id === p.user_id,
      }))}
      avions={(avions || []).map((a) => ({
        id: a.id,
        nom: a.nom_avion,
        type: `${(a.types_avion as any).constructeur} ${(a.types_avion as any).nom}`,
        quantite: a.quantite,
        capacitePassagers: a.capacite_passagers,
        capaciteCargo: a.capacite_cargo_kg,
        prixBillet: a.prix_billet_base,
        prixCargo: a.prix_cargo_kg,
        utilise: (avionsUtilises || []).some((u) => u.compagnie_avion_id === a.id),
      }))}
    />
  );
}
