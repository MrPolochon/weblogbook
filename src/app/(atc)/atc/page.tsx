import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Radio } from 'lucide-react';
import SeMettreEnServiceForm from '../SeMettreEnServiceForm';
import HorsServiceButton from '../HorsServiceButton';

const STATUT_LIB: Record<string, string> = {
  en_attente: 'En attente',
  accepte: 'Accepté',
  en_cours: 'En cours',
  en_attente_cloture: 'Clôture demandée',
};

export default async function AtcPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const [{ data: session }, { data: plansChezMoi }, { data: sessionsEnService }] = await Promise.all([
    supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single(),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, statut').eq('current_holder_user_id', user.id).is('pending_transfer_aeroport', null).in('statut', ['en_cours', 'accepte', 'en_attente_cloture']),
    admin.from('atc_sessions').select('aeroport, position').order('aeroport').order('position'),
  ]);

  const byAeroport = (sessionsEnService ?? []).reduce<Record<string, string[]>>((acc, s) => {
    const k = s.aeroport;
    if (!acc[k]) acc[k] = [];
    if (!acc[k].includes(s.position)) acc[k].push(s.position);
    acc[k].sort();
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Radio className="h-7 w-7" />
        Espace ATC
      </h1>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Aéroports et positions en service</h2>
        {Object.keys(byAeroport).length === 0 ? (
          <p className="text-slate-600 text-sm">Aucun contrôleur en service.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {Object.entries(byAeroport).map(([apt, positions]) => (
              <div key={apt} className="flex flex-col gap-1">
                <span className="text-sm font-bold text-slate-800">{apt}</span>
                <div className="flex flex-wrap gap-1">
                  {positions.map((pos) => (
                    <span key={`${apt}-${pos}`} className="inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                      {pos}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!session ? (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Se mettre en service</h2>
          <p className="text-slate-800 text-sm mb-4">Choisissez l&apos;aéroport et la position pour contrôler.</p>
          <SeMettreEnServiceForm />
        </div>
      ) : (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">En service</h2>
          <p className="text-slate-800 text-sm mb-4">
            {session.aeroport} — {session.position}
          </p>
          <HorsServiceButton />
        </div>
      )}

      {session && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Plans de vol chez vous</h2>
          {!plansChezMoi || plansChezMoi.length === 0 ? (
            <p className="text-slate-800">Aucun plan de vol.</p>
          ) : (
            <ul className="space-y-2">
              {plansChezMoi.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-200 last:border-0">
                  <span className="text-slate-900 font-medium">{p.numero_vol} — {p.aeroport_depart} → {p.aeroport_arrivee}</span>
                  <span className="flex items-center gap-2">
                    <span className={p.statut === 'en_attente_cloture' ? 'text-amber-700 text-sm font-semibold' : 'text-slate-700 text-sm font-medium'}>{STATUT_LIB[p.statut] ?? p.statut}</span>
                    <Link href={`/atc/plan/${p.id}`} className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline">Voir</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
