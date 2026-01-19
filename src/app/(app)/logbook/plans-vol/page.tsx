import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, FileText } from 'lucide-react';
import PlanVolCloturerButton from './PlanVolCloturerButton';

const STATUT_LIB: Record<string, string> = {
  depose: 'Déposé',
  en_attente: 'En attente ATC',
  accepte: 'Accepté',
  refuse: 'Refusé',
  en_cours: 'En cours',
  automonitoring: 'Autosurveillance',
  en_attente_cloture: 'Clôture demandée',
  cloture: 'Clôturé',
};

export default async function MesPlansVolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'atc') redirect('/logbook');

  const { data: raw } = await supabase
    .from('plans_vol')
    .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, created_at, temps_prev_min')
    .eq('pilote_id', user.id)
    .order('created_at', { ascending: false });
  // Masquer les plans refusés et clôturés (la liste reste vide s’il n’y a que ceux-là)
  const plans = (raw || []).filter((p: { statut: string }) => !['refuse', 'cloture'].includes(p.statut));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/logbook" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
          <FileText className="h-6 w-6" />
          Mes plans de vol
        </h1>
      </div>

      <div className="card">
        {!plans || plans.length === 0 ? (
          <p className="text-slate-500">Aucun plan de vol déposé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-left text-slate-400">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">N° vol</th>
                  <th className="pb-2 pr-4">Départ → Arrivée</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Durée prev.</th>
                  <th className="pb-2 pr-4">Statut</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-slate-700/50">
                    <td className="py-3 pr-4 text-slate-300">{format(new Date(p.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}</td>
                    <td className="py-3 pr-4 text-slate-300">{p.numero_vol}</td>
                    <td className="py-3 pr-4 text-slate-300">{p.aeroport_depart} → {p.aeroport_arrivee}</td>
                    <td className="py-3 pr-4 text-slate-300">{p.type_vol}</td>
                    <td className="py-3 pr-4 text-slate-300">{p.temps_prev_min} min</td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          p.statut === 'cloture' ? 'text-emerald-400' :
                          p.statut === 'refuse' ? 'text-red-400' :
                          p.statut === 'en_attente_cloture' ? 'text-amber-400' :
                          'text-slate-300'
                        }
                      >
                        {STATUT_LIB[p.statut] ?? p.statut}
                      </span>
                    </td>
                    <td className="py-3">
                      <PlanVolCloturerButton planId={p.id} statut={p.statut} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-slate-500 text-sm">
        Si aucun ATC n’a accepté le plan ou s’il est en autosurveillance, la clôture est immédiate. Sinon, l’ATC qui détient le plan doit confirmer la clôture.
      </p>
    </div>
  );
}
