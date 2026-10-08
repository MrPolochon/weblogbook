'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';

type Flight = { id: string; callsign: string | null; aeroport_depart: string; aeroport_arrivee: string; depart_utc: string; statut: string; mission_titre: string | null; mission_reward_base: number | null; mission_reward_final: number | null; mission_delay_minutes: number | null; mission_streak_bonus: number | null; pilote?: { identifiant: string } | { identifiant: string }[] | null };
type Aircraft = { id: string; nom_personnalise: string | null; detruit: boolean; detruit_raison: string | null; types_avion: { nom: string } | { nom: string }[]; vols: Flight[] };
type Journal = { id: string; vol_id: string; action: string; created_at: string; actor: { identifiant: string } | { identifiant: string }[] | null };
type Data = { fleet?: Aircraft[]; vols?: Flight[]; count?: number; journal?: Journal[]; canManage: boolean };
const nameOf = (profile: { identifiant: string } | { identifiant: string }[] | null | undefined) => (Array.isArray(profile) ? profile[0]?.identifiant : profile?.identifiant) || '—';

export default function OperationsTab({ mode }: { mode: 'operations' | 'flotte' }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('en_attente');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    fetch(`/api/armee/operations?mode=${mode}&statut=${status}&page=${page}`, { cache: 'no-store' })
      .then(async res => { const result = await res.json(); if (!res.ok) throw new Error(result.error); return result; })
      .then(result => { if (!cancelled) setData(result); })
      .catch(e => { if (!cancelled) setError(e.message || 'Chargement impossible.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, status, page, refresh]);

  async function decide(id: string, decision: 'validé' | 'refusé') {
    if (busy) return;
    setBusy(id); setError(null);
    try {
      const res = await fetch(`/api/armee/vols/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: decision, refusal_reason: decision === 'refusé' ? reason : null }) });
      const result = await res.json(); if (!res.ok) throw new Error(result.error);
      setRefusing(null); setReason(''); setRefresh(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Décision non enregistrée.'); }
    finally { setBusy(null); }
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <div><h2 className="text-xl font-semibold">{mode === 'flotte' ? 'Flotte Armée' : 'Tableau opérationnel'}</h2>
        <p className="text-sm text-slate-400">{mode === 'flotte' ? 'État des appareils et dernier vol enregistré.' : 'Suivez les dossiers et les décisions du commandement. Les primes sont versées au compte Armée.'}</p></div>
      <button type="button" className="btn-secondary" disabled={loading || Boolean(busy)} onClick={() => setRefresh(n => n + 1)}>Actualiser</button>
    </div>
    {mode === 'operations' && <label className="flex gap-3 items-center">État des dossiers<select className="input" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="en_attente">À valider</option><option value="refusé">Refusés</option><option value="validé">Terminés</option><option value="tous">Tous</option></select></label>}
    {error && <p role="alert" className="border border-red-500/40 bg-red-500/10 rounded-lg p-3 text-red-200">{error}</p>}
    {loading ? <p role="status">Chargement…</p> : !error && mode === 'flotte' ? <div className="grid gap-4 sm:grid-cols-2">
      {(data?.fleet || []).map(a => { const type = Array.isArray(a.types_avion) ? a.types_avion[0]?.nom : a.types_avion?.nom; const last = a.vols?.[0]; return <article key={a.id} className="rounded-xl border border-slate-700 p-4 space-y-2">
        <h3 className="font-semibold">{a.nom_personnalise || type}</h3><p className={a.detruit ? 'text-red-300' : 'text-emerald-300'}>{a.detruit ? 'Détruit — hors service' : 'En flotte'}</p>
        {a.detruit_raison && <p className="text-sm text-slate-400">{a.detruit_raison}</p>}
        {last ? <p className="text-sm">Dernier vol : {last.aeroport_depart} → {last.aeroport_arrivee}<br/>{formatDateMediumUTC(last.depart_utc)} · {last.statut}</p> : <p className="text-sm text-slate-400">Aucun vol enregistré.</p>}
      </article>; })}
      {!data?.fleet?.length && <p>Aucun appareil dans la flotte.</p>}
    </div> : !loading && mode === 'operations' && data ? <>
      <p className="text-sm text-slate-400">{data.count || 0} dossier(s) · {data.canManage ? 'Vue commandement' : 'Vos opérations'}</p>
      {(data.vols || []).map(v => <article key={v.id} className="border border-slate-700 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><div><Link className="font-semibold text-sky-300" href={`/militaire/vol/${v.id}`}>{v.callsign || v.mission_titre || 'Vol militaire'} · {v.aeroport_depart} → {v.aeroport_arrivee}</Link><p className="text-sm text-slate-400">{formatDateMediumUTC(v.depart_utc)} · {formatTimeUTC(v.depart_utc)} UTC · {nameOf(v.pilote)} · {v.statut}</p></div>{v.mission_reward_final != null && <span className="text-emerald-300">{v.mission_reward_final.toLocaleString('fr-FR')} F$ → Armée</span>}</div>
        {v.mission_reward_base != null && <p className="text-xs text-slate-400">Base : {v.mission_reward_base.toLocaleString('fr-FR')} F$ · {v.mission_reward_final == null ? 'Ponctualité fixée au dépôt ; bonus de série calculé en UTC à la validation.' : `Retard au dépôt : ${v.mission_delay_minutes || 0} min · Bonus de série : ${(v.mission_streak_bonus || 0).toLocaleString('fr-FR')} F$`}</p>}
        {data.canManage && v.statut === 'en_attente' && <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={Boolean(busy)} onClick={() => decide(v.id, 'validé')}>{busy === v.id ? 'Enregistrement…' : 'Valider le vol'}</button><button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => { setRefusing(v.id); setReason(''); }}>Refuser</button></div>}
        {refusing === v.id && <div className="space-y-2"><label className="block">Motif du refus<textarea className="input w-full" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)}/></label><button type="button" className="btn-secondary" disabled={Boolean(busy) || !reason.trim()} onClick={() => decide(v.id, 'refusé')}>Enregistrer le refus</button><button type="button" className="ml-3 underline" onClick={() => setRefusing(null)}>Annuler</button></div>}
      </article>)}
      {!data.vols?.length && <p>Aucun dossier pour ce filtre.</p>}
      {data.canManage && <section className="border-t border-slate-700 pt-4"><h3 className="font-semibold mb-3">Journal du commandement</h3>{(data.journal || []).map(item => <p key={item.id} className="text-sm text-slate-400 py-1">{formatDateMediumUTC(item.created_at)} · {formatTimeUTC(item.created_at)} UTC · {nameOf(item.actor)} · {item.action} {item.vol_id && !['suppression', 'archivage_profil'].includes(item.action) && <Link className="text-sky-300 underline" href={`/militaire/vol/${item.vol_id}`}>Voir le vol</Link>}</p>)}</section>}
    </> : null}
    {!loading && data && <div className="flex gap-3 items-center"><button type="button" disabled={page === 1 || Boolean(busy)} className="btn-secondary" onClick={() => setPage(n => n - 1)}>Précédent</button><span>Page {page}</span><button type="button" disabled={page * 30 >= (data.count || 0) || Boolean(busy)} className="btn-secondary" onClick={() => setPage(n => n + 1)}>Suivant</button></div>}
  </div>;
}
