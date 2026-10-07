import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { BULLETIN_CATEGORIES } from '@/lib/tribunal-bulletins';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal du tribunal administratif — PTFS Logbook' };
export default async function JournalPage({ searchParams }: { searchParams: { q?: string; category?: string; page?: string } }) {
  const supabase = await createClient();
  const q = (typeof searchParams.q === 'string' ? searchParams.q : '').trim().slice(0, 200);
  const category = BULLETIN_CATEGORIES.find(c => c === searchParams.category);
  const parsedPage = Number(searchParams.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 100000) : 1;
  let query = supabase.from('tribunal_bulletins').select('id, number, title, category, author_name, published_at', { count: 'exact' }).order('published_at', { ascending: false }).order('number', { ascending: false });
  if (q) query = query.ilike('title', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
  if (category) query = query.eq('category', category);
  const { data, count, error } = await query.range((page - 1) * 20, page * 20 - 1);
  const pageLink = (next: number) => `/journal?${new URLSearchParams({ q, category: category ?? '', page: String(next) })}`;
  return <main className="mx-auto min-h-dvh max-w-4xl space-y-6 px-4 py-8">
    <div className="flex flex-wrap justify-between gap-3 text-sm"><Link href="/documents" className="text-purple-300">← Documents</Link><Link href="/admin/documents/journal" className="text-purple-300">Publication · Administration</Link></div>
    <header><p className="text-sm font-semibold uppercase tracking-widest text-orange-300">Tribunal administratif du serveur</p><h1 className="mt-2 text-3xl font-bold text-slate-100">Journal des bulletins</h1><p className="mt-3 text-slate-400">Lois, décisions et informations officielles. Chaque publication est conservée et consultable librement, sans connexion.</p></header>
    <form className="card flex flex-wrap items-end gap-3" action="/journal">
      <label className="min-w-0 flex-1 space-y-1"><span className="text-sm text-slate-300">Rechercher un titre</span><input type="search" name="q" defaultValue={q} className="input w-full" maxLength={200} /></label>
      <label className="space-y-1"><span className="text-sm text-slate-300">Catégorie</span><select name="category" defaultValue={category ?? ''} className="input block"><option value="">Toutes</option>{BULLETIN_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <button className="btn-primary">Rechercher</button>
    </form>
    {error ? <p role="alert" className="card text-red-300">Le journal est temporairement indisponible. Réessayez plus tard.</p> : <>
      <p className="text-sm text-slate-400">{count ?? 0} bulletin(s) · Page {page}</p>
      {!data?.length && <p className="card text-slate-400">{q || category ? 'Aucun bulletin ne correspond à votre recherche.' : 'Aucun bulletin publié pour le moment.'}</p>}
      <div className="space-y-3">{data?.map(b => <Link key={b.id} href={`/journal/${b.id}`} className="card block space-y-2 hover:border-purple-400">
        <p className="text-xs text-purple-300">Bulletin n° {b.number} · {b.category}</p><h2 className="text-xl font-semibold text-slate-100">{b.title}</h2><p className="text-sm text-slate-400">{new Date(b.published_at).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} · {b.author_name}</p>
      </Link>)}</div>
      <nav aria-label="Pagination du journal" className="flex justify-between text-purple-300">{page > 1 ? <Link href={pageLink(page - 1)}>← Précédente</Link> : <span />}{page * 20 < (count ?? 0) && <Link href={pageLink(page + 1)}>Suivante →</Link>}</nav>
    </>}
  </main>;
}
