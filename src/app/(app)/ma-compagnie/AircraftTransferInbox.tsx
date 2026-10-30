'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type Offer = { id: string; alliance_id: string; type_transfert: string; prix: number | null; duree_jours: number | null; compagnie_avions: { immatriculation: string } | null; source: { nom: string } | null };
export default function AircraftTransferInbox({ compagnieId, onAccepted }: { compagnieId: string; onAccepted: () => void }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/compagnies/transferts-avions?compagnie_id=${encodeURIComponent(compagnieId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chargement impossible');
      setOffers(data); setError('');
    } catch { setError('Impossible de charger les propositions de transfert.'); }
  }, [compagnieId]);
  useEffect(() => { setOffers([]); void load(); }, [load]);
  async function respond(offer: Offer, action: 'accepter' | 'refuser') {
    if (!confirm(`${action === 'accepter' ? 'Accepter' : 'Refuser'} cette proposition${offer.type_transfert === 'vente' ? ` de ${offer.prix?.toLocaleString('fr-FR')} F$` : ''} ?`)) return;
    setBusy(offer.id);
    try {
      const response = await fetch(`/api/alliances/${offer.alliance_id}/transferts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transfert_id: offer.id, compagnie_dest_id: compagnieId, action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Action impossible');
      toast.success(action === 'accepter' ? 'Transfert accepté.' : 'Proposition refusée.');
      await load(); onAccepted();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur'); }
    finally { setBusy(null); }
  }
  if (error) return <p className="mb-4 text-sm text-amber-400">{error} <button className="underline" onClick={load}>Réessayer</button></p>;
  if (!offers.length) return null;
  return <section aria-label="Propositions de transfert reçues" className="mb-6 rounded-xl border border-emerald-500/30 p-4">
    <h3 className="font-semibold text-emerald-300 mb-3">Propositions de transfert reçues</h3>
    {offers.map(offer => <div key={offer.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 py-3">
      <div><p className="text-slate-100">{offer.compagnie_avions?.immatriculation || 'Appareil'} · {offer.source?.nom || 'Compagnie'}</p>
      <p className="text-sm text-slate-400">{offer.type_transfert === 'vente' ? `Vente · ${offer.prix?.toLocaleString('fr-FR')} F$` : offer.type_transfert === 'pret' ? `Prêt · ${offer.duree_jours} jours` : 'Don gratuit'}</p></div>
      <div className="flex gap-2"><button className="btn-primary" disabled={busy !== null} onClick={() => respond(offer, 'accepter')}>Accepter</button><button className="btn-secondary" disabled={busy !== null} onClick={() => respond(offer, 'refuser')}>Refuser</button></div>
    </div>)}
  </section>;
}
