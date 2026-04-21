import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText, ArrowRight, HeartPulse } from 'lucide-react';
import Link from 'next/link';

export default async function RapportsListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles')
    .select('role, siavi, ifsa')
    .eq('id', user.id)
    .single();

  const canView = profile?.role === 'admin' || profile?.siavi || profile?.role === 'siavi' || profile?.ifsa;
  if (!canView) redirect('/logbook');

  const { data: rapports } = await admin.from('siavi_rapports_medevac')
    .select(`
      id, numero_mission, date_mission, operator_base,
      aircraft_registration, aircraft_type, commander, outcome,
      created_at,
      plan_vol:plan_vol_id(id, numero_vol, aeroport_depart, aeroport_arrivee)
    `)
    .order('numero_mission', { ascending: false });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-600 via-red-700 to-rose-800 p-6 shadow-xl">
        <div className="relative flex items-center gap-4">
          <Link href="/siavi" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <div className="p-3 rounded-xl bg-white/10 backdrop-blur">
            <FileText className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Rapports MEDEVAC</h1>
            <p className="text-red-100/80 text-sm">{(rapports || []).length} rapport(s) — classés par ordre de mission</p>
          </div>
        </div>
      </div>

      {/* Liste */}
      {(!rapports || rapports.length === 0) ? (
        <div className="text-center py-16 border-2 border-dashed border-red-200 rounded-xl">
          <HeartPulse className="h-12 w-12 text-red-300 mx-auto mb-3" />
          <p className="text-red-600 font-medium">Aucun rapport MEDEVAC</p>
          <p className="text-red-500 text-sm mt-1">Les rapports sont créés après la clôture d&apos;un vol MEDEVAC</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-red-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-red-50 border-b border-red-200">
                  <th className="px-4 py-3 text-left font-bold text-red-800">N° Mission</th>
                  <th className="px-4 py-3 text-left font-bold text-red-800">Date</th>
                  <th className="px-4 py-3 text-left font-bold text-red-800">Vol</th>
                  <th className="px-4 py-3 text-left font-bold text-red-800">Route</th>
                  <th className="px-4 py-3 text-left font-bold text-red-800">Avion</th>
                  <th className="px-4 py-3 text-left font-bold text-red-800">Commandant</th>
                  <th className="px-4 py-3 text-left font-bold text-red-800"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {rapports.map((r) => {
                  const pv = r.plan_vol as any;
                  return (
                    <tr key={r.id} className="hover:bg-red-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-red-700 text-lg">#{r.numero_mission}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(r.date_mission).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {pv?.numero_vol || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sky-600">{pv?.aeroport_depart}</span>
                        <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
                        <span className="font-mono text-emerald-600">{pv?.aeroport_arrivee}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{r.aircraft_registration}</td>
                      <td className="px-4 py-3 text-slate-700">{r.commander}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/siavi/rapports/${r.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-xs font-medium transition-colors">
                          <FileText className="h-3.5 w-3.5" /> Voir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
