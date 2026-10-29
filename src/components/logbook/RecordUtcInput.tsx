'use client';

/** Two native controls remain editable on mobile while the value stays in UTC. */
export default function RecordUtcInput({ id, value, onChange, disabled, required }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [date = '', time = ''] = value.split('T');
  const update = (nextDate: string, nextTime: string) => onChange(nextDate || nextTime ? `${nextDate}T${nextTime}` : '');
  const classes = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-400 disabled:opacity-60';
  return <div aria-describedby={`${id}-help`}>
    <div className="grid min-w-0 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
      <label className="min-w-0 text-[11px] text-slate-400" htmlFor={`${id}-date`}>Date UTC<input id={`${id}-date`} type="date" className={`${classes} mt-1`} value={date} onChange={e=>update(e.target.value,time)} disabled={disabled} required={required}/></label>
      <label className="min-w-0 text-[11px] text-slate-400" htmlFor={`${id}-time`}>Heure UTC<input id={`${id}-time`} type="time" step={60} className={`${classes} mt-1`} value={time.slice(0,5)} onChange={e=>update(date,e.target.value)} disabled={disabled} required={required}/></label>
    </div>
    <p id={`${id}-help`} className="mt-2 text-xs text-slate-500">Saisissez l’heure UTC (Zulu), sans conversion en heure locale.</p>
  </div>;
}
