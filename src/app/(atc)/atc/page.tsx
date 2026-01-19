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
  const [{ data: session }, { data: plansChezMoi }] = await Promise.all([
    supabase.from('atc_sessions').select('id, aeroport, position, started_at').eq('user_id', user.id).single(),
    admin.from('plans_vol').select('id, numero_vol, aeroport_depart, aeroport_arrivee, statut').eq('current_holder_user_id', user.id).in('statut', ['en_attente', 'en_cours', 'accepte', 'en_attente_cloture']),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
        <Radio className="h-7 w-7" />
        Espace ATC
      </h1>

      {!session ? (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-800 mb-2">Se mettre en service</h2>
          <p className="text-slate-600 text-sm mb-4">Choisissez l&apos;aéroport et la position pour contrôler.</p>
          <SeMettreEnServiceForm />
        </div>
      ) : (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-800 mb-1">En service</h2>
          <p className="text-slate-600 text-sm mb-4">
            {session.aeroport} — {session.position}
          </p>
          <HorsServiceButton />
        </div>
      )}

      {session && (
        <div className="card">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Plans de vol chez vous</h2>
          {!plansChezMoi || plansChezMoi.length === 0 ? (
            <p className="text-slate-600">Aucun plan de vol.</p>
          ) : (
            <ul className="space-y-2">
              {plansChezMoi.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-200 last:border-0">
                  <span className="text-slate-700">{p.numero_vol} — {p.aeroport_depart} → {p.aeroport_arrivee}</span>
                  <span className="flex items-center gap-2">
                    <span className={p.statut === 'en_attente_cloture' ? 'text-amber-600 text-sm font-medium' : 'text-slate-500 text-sm'}>{STATUT_LIB[p.statut] ?? p.statut}</span>
                    <Link href={`/atc/plan/${p.id}`} className="text-sm text-sky-600 hover:underline">Voir</Link>
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
