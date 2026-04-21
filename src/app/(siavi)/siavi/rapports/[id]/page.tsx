import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import RapportPrintButton from './RapportPrintButton';

export default async function RapportViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: rapport } = await admin.from('siavi_rapports_medevac')
    .select(`
      *,
      plan_vol:plan_vol_id(
        id, numero_vol, aeroport_depart, aeroport_arrivee,
        temps_prev_min, type_vol, accepted_at, cloture_at
      ),
      auteur:created_by(identifiant)
    `)
    .eq('id', id)
    .single();

  if (!rapport) redirect('/siavi/rapports');

  const plan = rapport.plan_vol as any;
  const auteur = rapport.auteur as any;
  const timeline = (rapport.mission_timeline || []) as Array<{ heure: string; description: string }>;

  return (
    <div className="space-y-4">
      {/* Controls (hidden in print) */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/siavi/rapports" className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium transition-colors">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <RapportPrintButton />
      </div>

      {/* Official Report Document */}
      <div id="rapport-medevac" className="bg-white border border-slate-300 shadow-lg rounded-lg max-w-3xl mx-auto print:shadow-none print:border-none print:rounded-none print:max-w-none">
        <div className="p-8 sm:p-12 space-y-8 text-slate-900">
          {/* Header */}
          <div className="text-center border-b-2 border-red-600 pb-6">
            <h1 className="text-xl font-bold tracking-wide text-red-800 uppercase">
              Aviation Occurrence Report — MEDEVAC Mission
            </h1>
            <p className="text-4xl font-bold text-red-700 mt-2 font-mono">{rapport.numero_mission}</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-2">
              Classification: Confidential — Operational Medical Flight Record
            </p>
          </div>

          {/* 1. General Information */}
          <section>
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
              1. General Information
            </h2>
            <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-sm">
              <div><span className="text-slate-500">Date:</span> <span className="font-medium">{new Date(rapport.date_mission).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
              <div><span className="text-slate-500">Mission Type:</span> <span className="font-medium">MEDEVAC (Medical Evacuation)</span></div>
              <div><span className="text-slate-500">Operator Base:</span> <span className="font-mono font-medium">{rapport.operator_base}</span></div>
              <div><span className="text-slate-500">Aircraft Registration:</span> <span className="font-mono font-medium">{rapport.aircraft_registration}</span></div>
            </div>
          </section>

          {/* 2. Aircraft Information */}
          <section>
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
              2. Aircraft Information
            </h2>
            <div className="grid grid-cols-2 gap-y-2 gap-x-8 text-sm">
              <div><span className="text-slate-500">Aircraft Type:</span> <span className="font-medium">{rapport.aircraft_type}</span></div>
              <div><span className="text-slate-500">Role:</span> <span className="font-medium">{rapport.aircraft_role}</span></div>
              <div><span className="text-slate-500">Operational Status:</span> <span className="font-medium">Active MEDEVAC readiness</span></div>
            </div>
          </section>

          {/* 3. Flight Crew */}
          <section>
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
              3. Flight Crew
            </h2>
            <div className="space-y-1 text-sm">
              <div><span className="text-slate-500">Commander / Medical Pilot:</span> <span className="font-medium">{rapport.commander}</span></div>
              {rapport.co_pilot && <div><span className="text-slate-500">Co-Pilot / Medical Pilot:</span> <span className="font-medium">{rapport.co_pilot}</span></div>}
              {rapport.medical_team && <div><span className="text-slate-500">Medical Team:</span> <span className="font-medium">{rapport.medical_team}</span></div>}
            </div>
          </section>

          {/* 4. Mission Timeline */}
          {timeline.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
                4. Mission Timeline (UTC)
              </h2>
              <div className="space-y-1 text-sm">
                {timeline.map((entry, idx) => (
                  <div key={idx} className="flex gap-3">
                    <span className="font-mono font-bold text-red-700 w-14 flex-shrink-0">{entry.heure || '—'}</span>
                    <span>{entry.description}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. Medical Event Summary */}
          <section>
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
              5. Medical Event Summary
            </h2>
            <p className="text-sm whitespace-pre-wrap">{rapport.medical_summary}</p>
          </section>

          {/* 6. Ground Event */}
          {rapport.ground_event && (
            <section>
              <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
                6. Ground Event — Arrival
              </h2>
              <p className="text-sm whitespace-pre-wrap">{rapport.ground_event}</p>
            </section>
          )}

          {/* 7. Outcome */}
          <section>
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
              7. Outcome
            </h2>
            <p className="text-sm whitespace-pre-wrap">{rapport.outcome}</p>
          </section>

          {/* 8. Safety & Operational Remarks */}
          {rapport.safety_remarks && (
            <section>
              <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
                8. Safety & Operational Remarks
              </h2>
              <p className="text-sm whitespace-pre-wrap">{rapport.safety_remarks}</p>
            </section>
          )}

          {/* 9. Final Statement */}
          <section>
            <h2 className="text-sm font-bold text-red-800 uppercase tracking-wider border-b border-red-200 pb-1 mb-3">
              9. Final Statement
            </h2>
            <p className="text-sm text-slate-600 italic">
              This report is issued for operational review and aviation safety documentation purposes.
              All flight and medical procedures were conducted in accordance with MEDEVAC protocols during airborne phase.
            </p>
          </section>

          {/* Footer */}
          <div className="border-t-2 border-red-600 pt-4 mt-8 flex items-center justify-between text-xs text-slate-500">
            <span>MEDEVAC Mission Report — {plan?.numero_vol}</span>
            <span>Filed by {auteur?.identifiant || 'Agent SIAVI'} — {new Date(rapport.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
