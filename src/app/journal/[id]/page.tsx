import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isPublicBulletinPath } from '@/lib/tribunal-bulletins';

export const dynamic = 'force-dynamic';
export default async function BulletinPage({ params }: { params: { id: string } }) {
  if (!isPublicBulletinPath(`/journal/${params.id}`)) notFound();
  const supabase = await createClient();
  const { data: b, error } = await supabase.from('tribunal_bulletins').select('number, title, category, content, author_name, published_at').eq('id', params.id).maybeSingle();
  if (error) throw new Error('Journal temporairement indisponible');
  if (!b) notFound();
  return <main className="mx-auto min-h-dvh max-w-4xl space-y-6 px-4 py-8">
    <Link href="/journal" className="text-purple-300">← Tous les bulletins</Link>
    <article className="card space-y-5">
      <header><p className="text-sm font-semibold text-purple-300">Tribunal administratif · Bulletin n° {b.number} · {b.category}</p><h1 className="mt-3 break-words text-3xl font-bold text-slate-100">{b.title}</h1><p className="mt-3 text-sm text-slate-400">Publié le {new Date(b.published_at).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC · {b.author_name}</p></header>
      <div className="whitespace-pre-wrap break-words border-t border-slate-700 pt-5 leading-relaxed text-slate-200">{b.content}</div>
    </article>
    <p className="text-sm text-slate-500">Publication archivée. Les rectifications éventuelles font l’objet d’un nouveau bulletin.</p>
  </main>;
}
