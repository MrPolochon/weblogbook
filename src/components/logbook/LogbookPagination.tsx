import Link from 'next/link';
import {ChevronLeft,ChevronRight} from 'lucide-react';
export default function LogbookPagination({page,total,search,status,date,location}:{page:number;total:number;search:string;status:string;date:string;location:'haut'|'bas'}) {
  const pages=Math.max(1,Math.ceil(total/30));
  const href=(n:number)=>'/logbook?'+new URLSearchParams({page:String(n),q:search,statut:status,date}).toString()+'#historique';
  const candidates=[...new Set([1,page-1,page,page+1,pages])].filter(n=>n>=1&&n<=pages).sort((a,b)=>a-b);
  const base='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400';
  return <nav aria-label={`Pagination du carnet (${location})`} className="flex flex-wrap items-center justify-between gap-4 border-slate-700/50 py-4">
    <div className="text-sm"><p className="font-medium text-slate-200">{total&&page<=pages?`Vols ${(page-1)*30+1} à ${Math.min(page*30,total)} sur ${total}`:`${total} vol${total>1?'s':''}`}</p><p className="mt-1 text-xs text-slate-400">Page {page} sur {pages} · du plus récent au plus ancien</p></div>
    {pages>1&&<div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
      {page>1?<Link aria-label="Page précédente : vols plus récents" href={href(page-1)} className={`${base} border-slate-600 text-slate-200 hover:bg-slate-800`}><ChevronLeft className="h-4 w-4"/><span className="hidden sm:inline">Plus récents</span></Link>:<span aria-disabled="true" aria-label="Première page" className={`${base} border-slate-800 text-slate-600`}><ChevronLeft className="h-4 w-4"/></span>}
      <div className="flex items-center gap-1">{candidates.map((n,i)=><span key={n} className="flex items-center gap-1">{i>0&&n>candidates[i-1]+1&&<span className="px-1 text-slate-500">…</span>}<Link aria-label={`Page ${n}`} aria-current={n===page?'page':undefined} href={href(n)} className={`${base} min-w-10 ${n===page?'border-sky-500 bg-sky-500/15 font-semibold text-sky-200':'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>{n}</Link></span>)}</div>
      {page<pages?<Link aria-label="Page suivante : vols plus anciens" href={href(page+1)} className={`${base} border-sky-700 bg-sky-900/40 font-medium text-sky-200 hover:bg-sky-800/50`}><span className="hidden sm:inline">Plus anciens</span><ChevronRight className="h-4 w-4"/></Link>:<span aria-disabled="true" aria-label="Dernière page" className={`${base} border-slate-800 text-slate-600`}><ChevronRight className="h-4 w-4"/></span>}
    </div>}
  </nav>;
}
