'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, RefreshCw, Search, Star } from 'lucide-react';
import { FLIGHT_REVIEWS_FEED_LIMIT } from '@/lib/flight-reviews-feed';

type Review = { id: string; author_label: string; body: string; sentiment: string; rating: number; created_at: string };
const filters = [{ value: '', label: 'Tous les voyages' }, { value: 'positif', label: 'Belles expériences' }, { value: 'mitige', label: 'Avis partagés' }, { value: 'negatif', label: 'Déceptions' }];

export default function FlightReviewFeed() {
  const [reviews,setReviews] = useState<Review[]>([]);
  const [sentiment,setSentiment] = useState('');
  const [search,setSearch] = useState('');
  const [query,setQuery] = useState('');
  const [next,setNext] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const generation = useRef(0);
  const requestRef = useRef<AbortController|null>(null);
  const load = useCallback(async (cursor?: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ sentiment, q: query });
      if (cursor) params.set('before',cursor);
      const response = await fetch(`/api/avis-web?${params}`, { signal: controller.signal, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de charger les avis.');
      if (current!==generation.current) return;
      setReviews(previous => (cursor ? [...new Map([...previous,...result.reviews].map((row: Review)=>[row.id,row])).values()] : result.reviews).slice(0,FLIGHT_REVIEWS_FEED_LIMIT));
      setNext(result.next);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Impossible de charger les avis.');
    } finally { if (current===generation.current) setLoading(false); }
  },[sentiment,query]);
  useEffect(() => { setReviews([]); setNext(null); void load(); return () => { requestRef.current?.abort(); }; },[load]);
  useEffect(() => {
    let lastRefresh = 0;
    const refreshVisible = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      void load();
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [load]);
  return <section aria-label="Publications des voyageurs">
    <form onSubmit={event=>{event.preventDefault();const value=search.trim();if(value===query)void load();else setQuery(value);}} className="mb-4 flex gap-2">
      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3"><Search size={18} className="shrink-0 text-slate-500" /><input type="search" aria-label="Rechercher dans les publications" placeholder="Un trajet, une compagnie, une expérience…" maxLength={80} value={search} onChange={event=>setSearch(event.target.value)} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <button className="rounded-xl bg-sky-600 px-4 text-sm font-medium hover:bg-sky-500">Chercher</button>
    </form>
    <div className="mb-3 flex justify-end"><button type="button" disabled={loading} onClick={()=>void load()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-xs font-medium text-sky-200 hover:bg-slate-800 disabled:opacity-50"><RefreshCw aria-hidden size={14} />Actualiser les avis</button></div>
    <div className="mb-6 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="Filtrer les expériences">{filters.map(filter=><button key={filter.value} onClick={()=>setSentiment(filter.value)} aria-pressed={filter.value===sentiment} className={`min-h-10 shrink-0 rounded-full border px-3 text-xs font-medium ${filter.value===sentiment?'border-sky-600 bg-sky-600/15 text-sky-200':'border-slate-700 text-slate-400 hover:text-slate-200'}`}>{filter.label}</button>)}</div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-200">{error}<button onClick={()=>void load()} className="ml-3 underline">Réessayer</button></div>}
    <div aria-busy={loading} className="space-y-3">{reviews.map(review=><article key={review.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
      <header className="mb-3 flex items-center gap-3"><div aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${review.sentiment==='positif'?'bg-emerald-500/15 text-emerald-300':review.sentiment==='negatif'?'bg-amber-500/15 text-amber-300':'bg-slate-700 text-slate-300'}`}><MessageCircle size={18} /></div><div className="min-w-0"><p className="text-sm font-semibold">{review.author_label}</p><time dateTime={review.created_at} className="text-xs text-slate-500">{new Date(review.created_at).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} UTC · Avis simulé</time></div></header>
      <p className="whitespace-pre-line break-words text-[15px] leading-7 text-slate-200">{review.body}</p>
      <div aria-label={`${review.rating} étoiles sur 5`} className="mt-4 flex gap-1 text-amber-300/80">{[1,2,3,4,5].map(n=><Star aria-hidden key={n} size={13} fill={n<=review.rating?'currentColor':'none'} className={n<=review.rating?'':'text-slate-600'} />)}</div>
    </article>)}</div>
    {!loading&&!error&&!reviews.length&&<div className="rounded-2xl border border-dashed border-slate-700 px-6 py-14 text-center"><MessageCircle aria-hidden className="mx-auto mb-3 text-slate-600" /><p className="font-medium">{query||sentiment?'Aucun avis ne correspond à ces filtres':'Aucune publication pour le moment'}</p><p className="mt-2 text-sm leading-relaxed text-slate-500">{query||sentiment?'Essayez une autre recherche ou consultez toutes les expériences.':'Les voyageurs virtuels publient leurs expériences après la clôture et le règlement des vols commerciaux.'}</p>{(query||sentiment)&&<button type="button" onClick={()=>{setSearch('');setQuery('');setSentiment('');}} className="mt-4 min-h-10 text-sm text-sky-300 underline">Effacer les filtres</button>}</div>}
    {loading&&<p role="status" className="py-8 text-center text-sm text-slate-400">Chargement des expériences…</p>}
    {next&&!loading&&reviews.length<FLIGHT_REVIEWS_FEED_LIMIT&&<button onClick={()=>void load(next)} className="my-6 w-full rounded-xl border border-slate-700 py-3 text-sm text-slate-300 hover:bg-slate-800">Voir les publications précédentes</button>}
  </section>;
}
