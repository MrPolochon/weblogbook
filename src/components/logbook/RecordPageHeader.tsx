import Link from 'next/link';
import { ArrowLeft, Clock3 } from 'lucide-react';
import type { ReactNode } from 'react';

export default function RecordPageHeader({ title, description, backHref = '/logbook', actions }: {
  title: string;
  description: string;
  backHref?: string;
  actions?: ReactNode;
}) {
  return <header className="rounded-xl border border-slate-700 bg-slate-900 p-5 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link href={backHref} className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-400 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><ArrowLeft aria-hidden className="h-4 w-4"/> Retour au carnet</Link>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400"><Clock3 aria-hidden className="h-3.5 w-3.5"/> Horaires UTC</span>
    </div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-sky-400">Carnet de vol · Aviation civile</p><h1 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p></div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  </header>;
}
