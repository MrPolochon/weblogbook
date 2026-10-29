import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import MarcheClient from './MarcheClient';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';
import Link from 'next/link';

export default async function MarchePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();

  const [{ data: passagersData, error: passagersError }, { data: cargoData, error: cargoError }] = await Promise.all([
    admin.from('aeroport_passagers').select('code_oaci, passagers_disponibles, passagers_max, derniere_regeneration'),
    admin.from('aeroport_cargo').select('code_oaci, cargo_disponible, cargo_max, derniere_regeneration'),
  ]);

  if (passagersError || cargoError) return <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/70 p-6"><p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Préparation commerciale</p><h1 className="text-2xl font-semibold text-slate-100">Disponibilités momentanément indisponibles</h1><p role="alert" className="text-sm text-amber-200">La demande passagers et fret n’a pas pu être chargée. Aucun stock théorique n’est affiché à sa place.</p><Link href="/marche-passagers" className="inline-flex min-h-11 items-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500">Réessayer</Link></section>;

  const lastRegenIso = [...(passagersData ?? []), ...(cargoData ?? [])]
    .map((r) => ('derniere_regeneration' in r ? r.derniere_regeneration : null))
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null;
  const lastRegenMs = lastRegenIso ? new Date(lastRegenIso).getTime() : 0;
  const alerteMarche = !lastRegenIso
      ? 'La date de mise à jour des disponibilités n’est pas connue. Actualisez les données avant de préparer un vol.'
      : Date.now() - lastRegenMs > 2 * 60 * 60 * 1000
        ? 'Les disponibilités n’ont pas été régénérées depuis plus de deux heures. Elles restent indicatives jusqu’au dépôt du plan.'
        : null;

  const passagersAeroports = AEROPORTS_VOL_CIVIL.filter(a => passagersData?.some(p => p.code_oaci === a.code)).map(a => {
    const p = passagersData?.find(x => x.code_oaci === a.code);
    return {
      code: a.code, nom: a.nom, taille: a.taille, tourisme: a.tourisme,
      passagersMax: a.passagersMax, vor: a.vor, freq: a.freq,
      passagers_disponibles: p?.passagers_disponibles ?? 0,
      passagers_max: p?.passagers_max ?? a.passagersMax,
      derniere_regeneration: p?.derniere_regeneration ?? null,
    };
  });

  const cargoAeroports = AEROPORTS_VOL_CIVIL.filter(a => cargoData?.some(c => c.code_oaci === a.code)).map(a => {
    const c = cargoData?.find(x => x.code_oaci === a.code);
    return {
      code: a.code, nom: a.nom, taille: a.taille, industriel: a.industriel,
      cargoMax: a.cargoMax, vor: a.vor, freq: a.freq,
      cargo_disponible: c?.cargo_disponible ?? 0,
      cargo_max: c?.cargo_max ?? a.cargoMax,
      derniere_regeneration: c?.derniere_regeneration ?? null,
    };
  });

  const partialData = passagersAeroports.length < AEROPORTS_VOL_CIVIL.length || cargoAeroports.length < AEROPORTS_VOL_CIVIL.length;
  return <MarcheClient passagersAeroports={passagersAeroports} cargoAeroports={cargoAeroports} initialTab={params.type === 'cargo' ? 'cargo' : 'passagers'} alerteMarche={alerteMarche ?? (partialData ? 'Certains aéroports n’ont pas transmis de disponibilité. Seules les données connues sont présentées.' : null)} />;
}
