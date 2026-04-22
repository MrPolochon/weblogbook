import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, FileText, ArrowRight, HeartPulse, PenLine } from 'lucide-react';
import Link from 'next/link';
import { getPendingMedevacReport } from '@/lib/siavi/pending-report';

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

  const pendingPlanId = await getPendingMedevacReport(admin, user.id);

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

      {pendingPlanId && (
        <div className="rounded-xl border border-amber-400/60 bg-amber-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-amber-100">
            <strong>Rapport de mission à rédiger :</strong> un vol MEDEVAC que vous avez piloté est clôturé (dernier segment) mais le rapport n&apos;est pas encore enregistré.
          </p>
          <Link
            href={`/siavi/rapports/nouveau?plan=${pendingPlanId}`}
            className="inline-flex items-center justify-center gap-2 shrink-0 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 text-sm font-semibold transition-colors"
          >
            <PenLine className="h-4 w-4" /> Rédiger le rapport
          </Link>
        </div>
      )}

      {/* Liste */}
      {(!rapports || rapports.length === 0) ? (
        <div className="text-center py-16 border-2 border-dashed border-red-200 rounded-xl px-4">
          <HeartPulse className="h-12 w-12 text-red-300 mx-auto mb-3" />
          <p className="text-red-600 font-medium">Aucun rapport MEDEVAC enregistré</p>
          <p className="text-slate-600 text-sm mt-3 max-w-lg mx-auto leading-relaxed">
            Le rapport <strong className="text-slate-800">n&apos;est pas créé automatiquement</strong> à la clôture du vol.
            C&apos;est un <strong className="text-slate-800">compte rendu manuel</strong> (formulaire) déposé par le <strong className="text-slate-800">pilote</strong>, une fois la mission terminée — pour une mission en plusieurs segments, uniquement après clôture du <strong className="text-slate-800">dernier segment</strong>.
          </p>
          <p className="text-slate-500 text-sm mt-2 max-w-lg mx-auto">
            Les personnes qui ne pilotent pas ne verront un rapport ici qu&apos;après sa saisie par le pilote.
          </p>
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
