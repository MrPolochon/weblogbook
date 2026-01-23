import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MarketplaceContent from './MarketplaceContent';

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/atc');

  const [{ data: avions }, { data: comptePersonnel }, { data: compagniesPDG }] = await Promise.all([
    supabase
      .from('marketplace_avions')
      .select('type_avion_id, prix, version_cargo, capacite_cargo_kg, types_avion(nom, constructeur)')
      .order('types_avion(nom)'),
    supabase.from('felitz_comptes').select('id, solde').eq('user_id', user.id).is('compagnie_id', null).single(),
    supabase.from('compagnies').select('id, nom, pdg_id').eq('pdg_id', user.id),
  ]);

  return (
    <MarketplaceContent
      avions={(avions || []).map((a) => ({
        typeAvionId: a.type_avion_id,
        nom: `${(a.types_avion as any).constructeur} ${(a.types_avion as any).nom}`,
        prix: Number(a.prix),
        versionCargo: a.version_cargo || false,
        capaciteCargo: a.capacite_cargo_kg,
      }))}
      soldePersonnel={comptePersonnel ? Number(comptePersonnel.solde) : 0}
      compagnies={(compagniesPDG || []).map((c) => ({
        id: c.id,
        nom: c.nom,
      }))}
    />
  );
}
