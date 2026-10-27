'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type IdentityRequest = {
  id: string; ancien_code_oaci: string | null; ancienne_telephonie: string | null;
  nouveau_code_oaci: string; nouvelle_telephonie: string;
  statut: 'en_attente' | 'approuvee' | 'refusee'; created_at: string; traite_at: string | null;
  motif_reponse: string | null;
  compagnie: { nom: string } | null; demandeur: { identifiant: string } | null;
  traite_par: { identifiant: string } | null;
};
const labels = { en_attente: 'En attente de validation IFSA', approuvee: 'Approuvée et appliquée', refusee: 'Refusée' };

export default function CompanyIdentityRequests({ compagnieId, refreshKey = 0, onPendingCountChange }: {
  compagnieId?: string; refreshKey?: number; onPendingCountChange?: (count: number) => void;
}) {
  const reviewer = !compagnieId;
  const router = useRouter();
  const [rows, setRows] = useState<IdentityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('en_attente');
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);setError('');
    try {
      const res = await fetch(`/api/compagnies/identite-demandes${compagnieId ? `?compagnie_id=${compagnieId}` : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chargement impossible');
      setRows(data);
      onPendingCountChange?.(data.filter((d: IdentityRequest) => d.statut === 'en_attente').length);
    } catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible'); }
    finally { setLoading(false); }
  }, [compagnieId, onPendingCountChange]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  async function decide(id: string, action: 'approuver' | 'refuser') {
    setBusy(id);setError('');
    try {
      const res = await fetch('/api/compagnies/identite-demandes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, motif_reponse: motifs[id] || '' }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Traitement impossible');
      await load();router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Traitement impossible'); }
    finally { setBusy(null); }
  }
  const visible = reviewer && filter !== 'toutes' ? rows.filter(r => r.statut === filter) : rows;
  return <section className="mb-6 space-y-3 rounded-xl border border-slate-700 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold text-slate-100">Demandes de modification d’identité radio</h3>
      <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary text-sm">Actualiser</button>
    </div>
    <p className="text-sm text-amber-200">Tant que l’IFSA n’a pas approuvé la demande, la compagnie et ses pilotes doivent utiliser les appellations actuellement approuvées, jamais les nouvelles valeurs proposées.</p>
    {reviewer && <label className="block text-sm text-slate-300">Afficher{' '}
      <select className="input" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="en_attente">En attente</option><option value="approuvee">Approuvées</option>
        <option value="refusee">Refusées</option><option value="toutes">Tout l’historique</option>
      </select></label>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {loading ? <p className="text-sm text-slate-400">Chargement…</p> : visible.length === 0 ? <p className="text-sm text-slate-400">Aucune demande pour cet affichage.</p>
      : visible.map(row => <article key={row.id} className="space-y-2 rounded-lg bg-slate-800/60 p-4">
        <p className="font-semibold text-slate-100">{row.compagnie?.nom} — {labels[row.statut]}</p>
        <p className="text-sm text-slate-300">Avant : <span className="font-mono">{row.ancien_code_oaci || 'Non renseigné'} / {row.ancienne_telephonie || 'Non renseignée'}</span></p>
        <p className="text-sm text-slate-300">Proposé : <span className="font-mono">{row.nouveau_code_oaci} / {row.nouvelle_telephonie}</span></p>
        <p className="text-xs text-slate-400">Demande de {row.demandeur?.identifiant || 'Compte supprimé'} — {new Date(row.created_at).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC</p>
        {row.motif_reponse && <p className="text-sm text-slate-200">Décision : {row.motif_reponse}</p>}
        {row.traite_at && <p className="text-xs text-slate-400">Traitée par {row.traite_par?.identifiant || 'IFSA'} — {new Date(row.traite_at).toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC</p>}
        {reviewer && row.statut === 'en_attente' && <div className="space-y-2">
          <label className="block text-sm text-slate-300">Motif de décision et vérification de conformité
            <textarea className="input mt-1 w-full" maxLength={2000} value={motifs[row.id] || ''} onChange={e => setMotifs(prev => ({ ...prev, [row.id]: e.target.value }))} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={busy !== null || !motifs[row.id]?.trim()} onClick={() => void decide(row.id, 'approuver')}>Approuver et appliquer</button>
            <button type="button" className="btn-secondary" disabled={busy !== null || !motifs[row.id]?.trim()} onClick={() => void decide(row.id, 'refuser')}>Refuser</button>
          </div>
        </div>}
      </article>)}
  </section>;
}
