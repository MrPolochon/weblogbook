'use client';

import { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, Plus, Loader2, CheckCircle2, AlertTriangle, Clock, Trash2 } from 'lucide-react';
import { AEROPORTS_VOL_CIVIL } from '@/lib/aeroports-ptfs';
import type { AirportGate } from '@/lib/types';

interface Priority {
  id: string;
  aeroport: string;
  gate_id: string;
  prix_paye: number | null;
  expires_at: string;
  created_at: string;
  gate: { id: string; gate_code: string; terminal: string | null; gate_type: string } | null;
}

interface GateWithStatus extends AirportGate {
  available: boolean;
}

interface Props {
  compagnieId: string;
  isPdg: boolean;
}

export default function CompagniePrioritesPortesClient({ compagnieId, isPdg }: Props) {
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyStep, setBuyStep] = useState<'idle' | 'airport' | 'gate' | 'confirm'>('idle');
  const [selectedAeroport, setSelectedAeroport] = useState('');
  const [availableGates, setAvailableGates] = useState<GateWithStatus[]>([]);
  const [selectedGate, setSelectedGate] = useState<GateWithStatus | null>(null);
  const [prixInfo, setPrixInfo] = useState<{ prix: number; estHub: boolean } | null>(null);
  const [buyLoading, setBuyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPriorities = useCallback(async () => {
    const res = await fetch(`/api/ground/priority?compagnie_id=${compagnieId}`);
    const d = await res.json() as { priorities?: Priority[] };
    setPriorities(d.priorities ?? []);
    setLoading(false);
  }, [compagnieId]);

  useEffect(() => { loadPriorities(); }, [loadPriorities]);

  async function loadGatesForAeroport(aeroport: string) {
    const res = await fetch(`/api/ground/gates?aeroport=${aeroport}`);
    const d = await res.json() as { gates?: GateWithStatus[] };
    const gates = (d.gates ?? []).filter((g) => g.gate_type !== 'special' && g.gate_type !== 'helicopter');
    setAvailableGates(gates);
  }

  async function selectGateAndGetPrice(gate: GateWithStatus) {
    setSelectedGate(gate);
    setBuyStep('confirm');
    const res = await fetch('/api/ground/priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compagnie_id: compagnieId, aeroport: selectedAeroport, gate_id: gate.id, preview: true }),
    });
    // Pour le calcul de prix sans acheter, on simule la logique pricing
    // En attendant, on affiche une estimation
    const estimated = 50000 * Math.pow(2, priorities.filter((p) => p.aeroport === selectedAeroport).length);
    setPrixInfo({ prix: estimated, estHub: false });
  }

  async function confirmPurchase() {
    if (!selectedGate) return;
    setBuyLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ground/priority', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compagnie_id: compagnieId, aeroport: selectedAeroport, gate_id: selectedGate.id }),
      });
      const d = await res.json() as { error?: string; prix?: number; estHub?: boolean };
      if (!res.ok) {
        setError(d.error ?? 'Erreur lors de l\'achat');
        return;
      }
      setSuccess(`Abonnement acheté ! ${(d.prix ?? 0).toLocaleString('fr-FR')} F$${d.estHub ? ' (réduction hub -50%)' : ''}`);
      setBuyStep('idle');
      setSelectedAeroport('');
      setSelectedGate(null);
      await loadPriorities();
    } finally {
      setBuyLoading(false);
    }
  }

  function resetBuy() {
    setBuyStep('idle');
    setSelectedAeroport('');
    setSelectedGate(null);
    setPrixInfo(null);
    setError(null);
  }

  const now = new Date();
  const active = priorities.filter((p) => new Date(p.expires_at) > now);
  const expired = priorities.filter((p) => new Date(p.expires_at) <= now);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-indigo-400" />
          <h3 className="text-base font-bold text-slate-100">Priorités de Portes</h3>
          {active.length > 0 && (
            <span className="text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
              {active.length} actif{active.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {isPdg && buyStep === 'idle' && (
          <button
            type="button"
            onClick={() => setBuyStep('airport')}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3 py-2 text-sm font-semibold text-white transition-colors"
          >
            <Plus className="h-4 w-4" />
            Acheter
          </button>
        )}
      </div>

      {/* Notifications */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-700/40 bg-emerald-900/20 px-3 py-2.5 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-700/40 bg-red-900/20 px-3 py-2.5 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Formulaire d'achat */}
      {buyStep !== 'idle' && (
        <div className="rounded-2xl border border-indigo-700/40 bg-indigo-900/10 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-indigo-200">Nouvel abonnement priorité</h4>
            <button type="button" onClick={resetBuy} className="text-xs text-slate-400 hover:text-slate-200">Annuler</button>
          </div>

          {/* Étape 1 : Aéroport */}
          {buyStep === 'airport' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Choisir un aéroport</label>
              <select
                value={selectedAeroport}
                onChange={(e) => {
                  setSelectedAeroport(e.target.value);
                  if (e.target.value) {
                    loadGatesForAeroport(e.target.value);
                    setBuyStep('gate');
                  }
                }}
                className="w-full rounded-xl border border-slate-600/50 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-500/60 outline-none"
              >
                <option value="">— Sélectionner —</option>
                {AEROPORTS_VOL_CIVIL.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Tarif base : 50 000 F$/mois — multiplié par 2 pour chaque porte supplémentaire sur le même aéroport.
              </p>
            </div>
          )}

          {/* Étape 2 : Porte */}
          {buyStep === 'gate' && selectedAeroport && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Choisir une porte à {selectedAeroport}</label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {availableGates.map((gate) => (
                  <button
                    key={gate.id}
                    type="button"
                    onClick={() => selectGateAndGetPrice(gate)}
                    className="rounded-xl border border-slate-700/40 bg-slate-800/30 hover:border-indigo-600/50 hover:bg-indigo-900/10 p-3 text-left transition-colors"
                  >
                    <p className="font-bold text-slate-100 text-sm">{gate.gate_code}</p>
                    {gate.terminal && <p className="text-xs text-slate-500 mt-0.5">{gate.terminal}</p>}
                    {gate.max_aircraft_size && <p className="text-xs text-slate-500">Max: {gate.max_aircraft_size}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Étape 3 : Confirmation */}
          {buyStep === 'confirm' && selectedGate && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Aéroport :</span>
                  <span className="font-semibold text-slate-200">{selectedAeroport}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Porte :</span>
                  <span className="font-semibold text-slate-200">{selectedGate.gate_code} {selectedGate.terminal ? `(${selectedGate.terminal})` : ''}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Durée :</span>
                  <span className="font-semibold text-slate-200">30 jours</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-700/40 pt-2">
                  <span className="text-slate-300 font-semibold">Prix :</span>
                  <span className="font-black text-indigo-300">
                    {prixInfo ? `${prixInfo.prix.toLocaleString('fr-FR')} F$${prixInfo.estHub ? ' (-50% hub)' : ''}` : '…'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={confirmPurchase}
                disabled={buyLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-sm font-bold text-white transition-colors disabled:opacity-50"
              >
                {buyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmer l&apos;achat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Liste abonnements actifs */}
      {active.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Abonnements actifs</h4>
          {active.map((p) => {
            const expiresIn = Math.ceil((new Date(p.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return (
              <div key={p.id} className="rounded-xl border border-emerald-800/30 bg-emerald-900/10 p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <LayoutGrid className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-slate-100 text-sm">
                      {p.gate?.gate_code} — <span className="font-mono">{p.aeroport}</span>
                    </p>
                    {p.gate?.terminal && <p className="text-xs text-slate-400">{p.gate.terminal}</p>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expire dans {expiresIn}j
                      </span>
                      {p.prix_paye && (
                        <span>{(p.prix_paye).toLocaleString('fr-FR')} F$ payés</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Actif
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Liste abonnements expirés */}
      {expired.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Expirés</h4>
          {expired.slice(0, 5).map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-3 flex items-center justify-between opacity-50">
              <div>
                <p className="text-sm text-slate-300">
                  {p.gate?.gate_code} — <span className="font-mono">{p.aeroport}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Expiré le {new Date(p.expires_at).toLocaleDateString('fr-FR')}
                  {p.prix_paye && ` • ${p.prix_paye.toLocaleString('fr-FR')} F$`}
                </p>
              </div>
              <Trash2 className="h-4 w-4 text-slate-600" />
            </div>
          ))}
        </div>
      )}

      {priorities.length === 0 && buyStep === 'idle' && (
        <div className="rounded-xl border border-slate-700/30 bg-slate-800/20 p-8 text-center">
          <LayoutGrid className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Aucune priorité de porte</p>
          <p className="text-slate-500 text-xs mt-1">
            Abonnez-vous pour garantir une porte spécifique à l&apos;arrivée
          </p>
        </div>
      )}
    </div>
  );
}
