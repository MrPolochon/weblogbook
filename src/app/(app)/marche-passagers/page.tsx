import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import MarcheClient from './MarcheClient';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';

export default async function MarchePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const [{ data: passagersData, error: passagersError }, { data: cargoData, error: cargoError }] = await Promise.all([
    admin.from('aeroport_passagers').select('code_oaci, passagers_disponibles, passagers_max, derniere_regeneration'),
    admin.from('aeroport_cargo').select('code_oaci, cargo_disponible, cargo_max, derniere_regeneration'),
  ]);

  const lastRegenIso = [...(passagersData ?? []), ...(cargoData ?? [])]
    .map((r) => ('derniere_regeneration' in r ? r.derniere_regeneration : null))
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null;
  const lastRegenMs = lastRegenIso ? new Date(lastRegenIso).getTime() : 0;
  const alerteMarche = passagersError || cargoError
    ? 'Impossible de lire le marché (vue ou table absente).'
    : !lastRegenIso
      ? 'Aucune régénération enregistrée — le cron /api/cron/marche ou les RPC regenerer_* sont peut-être absents.'
      : Date.now() - lastRegenMs > 2 * 60 * 60 * 1000
        ? 'Dernière régénération il y a plus de 2 h — vérifier le cron marché.'
        : null;

  const passagersAeroports = AEROPORTS_VOL_CIVIL.map(a => {
    const p = passagersData?.find(x => x.code_oaci === a.code);
    return {
      code: a.code, nom: a.nom, taille: a.taille, tourisme: a.tourisme,
      passagersMax: a.passagersMax, vor: a.vor, freq: a.freq,
      passagers_disponibles: p?.passagers_disponibles ?? a.passagersMax,
      passagers_max: p?.passagers_max ?? a.passagersMax,
      derniere_regeneration: p?.derniere_regeneration ?? null,
    };
  });

  const cargoAeroports = AEROPORTS_VOL_CIVIL.map(a => {
    const c = cargoData?.find(x => x.code_oaci === a.code);
    return {
      code: a.code, nom: a.nom, taille: a.taille, industriel: a.industriel,
      cargoMax: a.cargoMax, vor: a.vor, freq: a.freq,
      cargo_disponible: c?.cargo_disponible ?? a.cargoMax,
      cargo_max: c?.cargo_max ?? a.cargoMax,
      derniere_regeneration: c?.derniere_regeneration ?? null,
    };
  });

  return <MarcheClient passagersAeroports={passagersAeroports} cargoAeroports={cargoAeroports} alerteMarche={alerteMarche} />;
}
