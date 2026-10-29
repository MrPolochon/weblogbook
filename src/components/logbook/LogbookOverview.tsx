import {BookOpen,CheckCircle2,Clock,Timer} from 'lucide-react';
export type LogbookSummary={total:number;validated:number;pending:number;refused:number;minutes:number;types:string[]};
export default function LogbookOverview({summary,initialMinutes=0}:{summary:LogbookSummary;initialMinutes?:number}) {
  const minutes=initialMinutes+summary.minutes;
  const items=[
    {label:'Vols dans le carnet',value:String(summary.total),detail:'Toutes les pages, tous les statuts',icon:BookOpen,tone:'text-sky-300',bg:'bg-sky-400/10'},
    {label:'Heures validées',value:`${Math.floor(minutes/60)} h ${String(minutes%60).padStart(2,'0')}`,detail:initialMinutes>0?'Vols validés et heures initiales':'Calculées sur les vols validés',icon:Clock,tone:'text-emerald-300',bg:'bg-emerald-400/10'},
    {label:'Vols validés',value:String(summary.validated),detail:summary.refused?`${summary.refused} vol${summary.refused>1?'s':''} refusé${summary.refused>1?'s':''}`:'Enregistrés dans votre progression',icon:CheckCircle2,tone:'text-slate-200',bg:'bg-slate-800'},
    {label:'En attente',value:String(summary.pending),detail:summary.pending?'En attente de validation':'Aucun vol en attente de validation',icon:Timer,tone:'text-amber-300',bg:'bg-amber-400/10'},
  ];
  return <section aria-label="Vue d’ensemble du carnet complet" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
    {items.map(({label,value,detail,icon:Icon,tone,bg})=><div key={label} className="rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-2"><p className="text-xs font-medium text-slate-400 sm:text-sm">{label}</p><span className={`rounded-lg p-2 ${tone} ${bg}`}><Icon aria-hidden className="h-4 w-4"/></span></div>
      <p className={`text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${tone}`}>{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">{detail}</p>
    </div>)}
  </section>;
}
