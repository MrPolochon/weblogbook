import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { formatDuree } from '@/lib/utils';

export default function RecordFlightSummary({ departure, arrival, departureUtc, durationMinutes, aircraft, company, callsign, role }: {
  departure: string;
  arrival: string;
  departureUtc: string;
  durationMinutes: number;
  aircraft: string;
  company: string;
  callsign?: string;
  role?: string;
}) {
  const validDate = departureUtc && Number.isFinite(Date.parse(departureUtc));
  const validDuration = Number.isFinite(durationMinutes) && durationMinutes > 0;
  const arrivalUtc = validDate && validDuration ? new Date(Date.parse(departureUtc) + durationMinutes * 60000).toISOString() : '';
  const fields = [
    ['Appareil', aircraft || 'À renseigner'],
    ['Exploitant', company || 'À renseigner'],
    ['Départ UTC', validDate ? `${formatDateMediumUTC(departureUtc)} · ${formatTimeUTC(departureUtc)}` : 'À renseigner'],
    ['Arrivée UTC', arrivalUtc ? `${formatDateMediumUTC(arrivalUtc)} · ${formatTimeUTC(arrivalUtc)}` : 'Calculée avec le départ et la durée'],
    ['Durée déclarée', validDuration ? formatDuree(durationMinutes) : 'À renseigner'],
    ['Fonction à bord', role || 'À renseigner'],
  ];
  return <section aria-label="Récapitulatif des données du vol" className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-3"><p className="font-mono text-base font-semibold tracking-wide text-slate-100">{departure || '—'} <span className="px-2 text-slate-500">→</span> {arrival || '—'}</p><span className="font-mono text-xs text-sky-300">{callsign || 'Sans indicatif'}</span></div>
    <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label,value])=><div key={label}><dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-200">{value}</dd></div>)}</dl>
  </section>;
}
