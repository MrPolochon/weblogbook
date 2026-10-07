'use client';
import { useRef, useState } from 'react';
import { BULLETIN_CATEGORIES } from '@/lib/tribunal-bulletins';
import Link from 'next/link';

export default function PublishBulletinForm() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('Information');
  const [preview, setPreview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [publishedId, setPublishedId] = useState<string | null>(null);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || publishedId || !confirmed) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/tribunal/bulletins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, category }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Publication impossible.');
      setPublishedId(result.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Publication impossible.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (publishedId) return <div className="card space-y-3" role="status"><p className="text-emerald-300">Le bulletin est publié et archivé.</p><Link href={`/journal/${publishedId}`} className="btn-primary inline-block">Lire et partager le bulletin</Link><button type="button" className="ml-3 text-purple-300" onClick={() => { setPublishedId(null); setTitle(''); setContent(''); setConfirmed(false); setPreview(false); }}>Rédiger un autre bulletin</button></div>;
  return <form onSubmit={publish} className="card space-y-5">
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
      <label className="block space-y-1"><span className="label">Catégorie</span><select className="input w-full" value={category} onChange={e => { setCategory(e.target.value); setConfirmed(false); }}>{BULLETIN_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label className="block space-y-1"><span className="label">Titre</span><input required minLength={3} maxLength={200} className="input w-full" value={title} onChange={e => { setTitle(e.target.value); setConfirmed(false); }} /></label>
      <label className="block space-y-1"><span className="label">Texte du bulletin</span><textarea required minLength={10} maxLength={50000} rows={14} className="input w-full resize-y" value={content} onChange={e => { setContent(e.target.value); setConfirmed(false); }} /><span className="text-xs text-slate-500">{content.length.toLocaleString('fr-FR')} / 50 000 caractères · Texte simple, paragraphes conservés.</span></label>
      <button type="button" className="text-purple-300" aria-expanded={preview} onClick={() => setPreview(!preview)}>{preview ? 'Masquer l’aperçu' : 'Relire l’aperçu'}</button>
      {preview && <article className="space-y-3 rounded-xl border border-purple-700 p-4"><p className="text-purple-300">{category} · Aperçu avant publication</p><h2 className="break-words text-xl font-semibold">{title}</h2><p className="whitespace-pre-wrap break-words">{content}</p></article>}
      <label className="flex items-start gap-2 text-sm text-slate-300"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1" /><span>J’ai relu ce bulletin. Je confirme sa publication publique et son archivage permanent. Toute rectification nécessitera un nouveau bulletin.</span></label>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <button className="btn-primary" disabled={!confirmed || busy}>{busy ? 'Publication…' : 'Publier et archiver'}</button>
    </fieldset>
  </form>;
}
