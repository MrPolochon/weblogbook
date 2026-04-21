'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, MapPin, ShoppingCart, RefreshCw, Percent } from 'lucide-react';
import Link from 'next/link';

interface Props {
  config: { pourcentage_salaire_pilote: number };
  compteSolde: number;
}

export default function FlotteSiaviClient({ config, compteSolde }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [showHubForm, setShowHubForm] = useState(false);
  const [hubCode, setHubCode] = useState('');
  const [hubPrincipal, setHubPrincipal] = useState(false);
  const [hubLoading, setHubLoading] = useState(false);
  const [hubMsg, setHubMsg] = useState('');

  const [showConfigForm, setShowConfigForm] = useState(false);
  const [pctSalaire, setPctSalaire] = useState(String(config.pourcentage_salaire_pilote));
  const [configLoading, setConfigLoading] = useState(false);
  const [configMsg, setConfigMsg] = useState('');

  async function handleBuyHub(e: React.FormEvent) {
    e.preventDefault();
    setHubMsg('');
    setHubLoading(true);
    try {
      const res = await fetch('/api/siavi/hubs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aeroport_oaci: hubCode.trim().toUpperCase(), is_principal: hubPrincipal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setHubMsg(data.message || 'Hub créé');
      setHubCode('');
      setShowHubForm(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setHubMsg(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setHubLoading(false);
    }
  }

  async function handleUpdateConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigMsg('');
    setConfigLoading(true);
    try {
      const res = await fetch('/api/siavi/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pourcentage_salaire_pilote: Number(pctSalaire) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setConfigMsg('Configuration mise à jour');
      setShowConfigForm(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setConfigMsg(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setConfigLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-white border-2 border-red-400 shadow-sm p-6 space-y-4">
      <h2 className="text-lg font-bold text-red-900 flex items-center gap-2">
        <Settings className="h-5 w-5 text-red-600" />
        Gestion Chef de brigade
      </h2>

      {hubMsg && <p className={`text-sm ${hubMsg.includes('Erreur') || hubMsg.includes('insuffisant') ? 'text-red-600' : 'text-emerald-600'}`}>{hubMsg}</p>}
      {configMsg && <p className={`text-sm ${configMsg.includes('Erreur') ? 'text-red-600' : 'text-emerald-600'}`}>{configMsg}</p>}

      <div className="flex flex-wrap gap-3">
        <Link href="/marketplace"
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
          <ShoppingCart className="h-4 w-4" />
          Marketplace
        </Link>

        <button onClick={() => setShowHubForm(!showHubForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium transition-colors border border-red-300">
          <MapPin className="h-4 w-4" />
          Acheter un hub
        </button>

        <button onClick={() => setShowConfigForm(!showConfigForm)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-sm font-medium transition-colors border border-red-300">
          <Percent className="h-4 w-4" />
          Salaire pilote : {config.pourcentage_salaire_pilote}%
        </button>
      </div>

      {showHubForm && (
        <form onSubmit={handleBuyHub} className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-3">
          <div>
            <label className="block text-sm font-medium text-red-800 mb-1">Code OACI du hub</label>
            <input type="text" value={hubCode} onChange={e => setHubCode(e.target.value)}
              placeholder="Ex: IRFD" maxLength={4}
              className="w-full px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 font-mono uppercase bg-white" required />
          </div>
          <label className="flex items-center gap-2 text-sm text-red-800">
            <input type="checkbox" checked={hubPrincipal} onChange={e => setHubPrincipal(e.target.checked)} className="rounded border-red-300" />
            Hub principal
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={hubLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2">
              {hubLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Acheter
            </button>
            <button type="button" onClick={() => setShowHubForm(false)}
              className="px-4 py-2 bg-red-200 text-red-800 rounded-lg text-sm font-medium hover:bg-red-300">
              Annuler
            </button>
          </div>
        </form>
      )}

      {showConfigForm && (
        <form onSubmit={handleUpdateConfig} className="p-4 rounded-lg bg-red-50 border border-red-200 space-y-3">
          <div>
            <label className="block text-sm font-medium text-red-800 mb-1">Pourcentage salaire pilote MEDEVAC</label>
            <div className="flex items-center gap-2">
              <input type="number" value={pctSalaire} onChange={e => setPctSalaire(e.target.value)}
                min="0" max="100" step="1"
                className="w-24 px-3 py-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 bg-white" required />
              <span className="text-red-800 font-bold">%</span>
            </div>
            <p className="text-xs text-red-600 mt-1">Le reste ({100 - (Number(pctSalaire) || 0)}%) va au compte SIAVI</p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={configLoading}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2">
              {configLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
              Enregistrer
            </button>
            <button type="button" onClick={() => setShowConfigForm(false)}
              className="px-4 py-2 bg-red-200 text-red-800 rounded-lg text-sm font-medium hover:bg-red-300">
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
