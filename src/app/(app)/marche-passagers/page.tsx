import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import MarcheClient from './MarcheClient';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';

export default async function MarchePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  // Régénérer passagers et cargo en parallèle
  await Promise.all([
    (async () => { try { await admin.rpc('regenerer_passagers_aeroport'); } catch { /* rpc unavailable */ } })(),
    (async () => { try { await admin.rpc('regenerer_cargo_aeroport'); } catch { /* rpc unavailable */ } })(),
  ]);

  const [{ data: passagersData }, { data: cargoData }] = await Promise.all([
    admin.from('aeroport_passagers').select('code_oaci, passagers_disponibles, passagers_max, derniere_regeneration'),
    admin.from('aeroport_cargo').select('code_oaci, cargo_disponible, cargo_max, derniere_regeneration'),
  ]);

  const passagersAeroports = AEROPORTS_PTFS.map(a => {
    const p = passagersData?.find(x => x.code_oaci === a.code);
    return {
      code: a.code, nom: a.nom, taille: a.taille, tourisme: a.tourisme,
      passagersMax: a.passagersMax, vor: a.vor, freq: a.freq,
      passagers_disponibles: p?.passagers_disponibles ?? a.passagersMax,
      passagers_max: p?.passagers_max ?? a.passagersMax,
      derniere_regeneration: p?.derniere_regeneration ?? null,
    };
  });

  const cargoAeroports = AEROPORTS_PTFS.map(a => {
    const c = cargoData?.find(x => x.code_oaci === a.code);
    return {
      code: a.code, nom: a.nom, taille: a.taille, industriel: a.industriel,
      cargoMax: a.cargoMax, vor: a.vor, freq: a.freq,
      cargo_disponible: c?.cargo_disponible ?? a.cargoMax,
      cargo_max: c?.cargo_max ?? a.cargoMax,
      derniere_regeneration: c?.derniere_regeneration ?? null,
    };
  });

  return <MarcheClient passagersAeroports={passagersAeroports} cargoAeroports={cargoAeroports} />;
}
