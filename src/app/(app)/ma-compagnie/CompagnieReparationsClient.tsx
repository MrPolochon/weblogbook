'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench, CreditCard, Loader2, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface Demande {
  id: string;
  statut: string;
  usure_avant: number | null;
  usure_apres: number | null;
  prix_total: number | null;
  score_qualite: number | null;
  created_at: string;
  entreprise?: { id: string; nom: string } | null;
  avion?: { id: string; immatriculation: string; nom: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  demandee: { label: 'Demandee', color: 'bg-blue-500/20 text-blue-400' },
  acceptee: { label: 'Acceptee', color: 'bg-emerald-500/20 text-emerald-400' },
  en_transit: { label: 'En transit', color: 'bg-amber-500/20 text-amber-400' },
  en_reparation: { label: 'En reparation', color: 'bg-orange-500/20 text-orange-400' },
  mini_jeux: { label: 'Mini-jeux', color: 'bg-purple-500/20 text-purple-400' },
  terminee: { label: 'Terminee', color: 'bg-sky-500/20 text-sky-400' },
  facturee: { label: 'A payer', color: 'bg-red-500/20 text-red-400' },
  payee: { label: 'Payee', color: 'bg-emerald-500/20 text-emerald-400' },
  completee: { label: 'Completee', color: 'bg-slate-500/20 text-slate-400' },
};

export default function CompagnieReparationsClient({ compagnieId, isPdg }: { compagnieId: string; isPdg: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reparation/demandes?compagnie_id=${compagnieId}`);
        if (res.ok) {
          const data = await res.json();
          setDemandes(data.filter((d: Demande) => !['completee', 'refusee', 'annulee'].includes(d.statut)));
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [compagnieId]);

  async function handlePayer(demandeId: string) {
    if (!confirm('Confirmer le paiement de cette reparation ?')) return;
    setPaying(demandeId);
    try {
      const res = await fetch(`/api/reparation/demandes/${demandeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'payer' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erreur');
      toast.success('Paiement effectue');
      setDemandes(prev => prev.map(dm => dm.id === demandeId ? { ...dm, statut: 'payee' } : dm));
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setPaying(null);
    }
  }

  if (loading) return null;
  if (demandes.length === 0) return null;

  const facturees = demandes.filter(d => d.statut === 'facturee');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
        <Wrench className="h-4 w-4" />
        Reparations en cours ({demandes.length})
        {facturees.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">
            {facturees.length} a payer
          </span>
        )}
      </h3>
      <div className="space-y-2">
        {demandes.map(d => {
          const st = STATUS_LABELS[d.statut] || { label: d.statut, color: 'bg-slate-500/20 text-slate-400' };
          return (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-200">{d.avion?.immatriculation || '?'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${st.color}`}>{st.label}</span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {d.entreprise?.nom || 'Entreprise ?'}
                  {d.prix_total != null && d.prix_total > 0 && ` — ${d.prix_total.toLocaleString('fr-FR')} F$`}
                  {d.usure_avant != null && d.usure_apres != null && ` (${d.usure_avant}% → ${d.usure_apres}%)`}
                </p>
              </div>
              {d.statut === 'facturee' && isPdg && (
                <button
                  onClick={() => handlePayer(d.id)}
                  disabled={paying === d.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                >
                  {paying === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                  Payer {d.prix_total?.toLocaleString('fr-FR')} F$
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
