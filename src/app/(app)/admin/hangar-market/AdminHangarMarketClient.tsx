'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Percent, User, Building2, ArrowRight } from 'lucide-react';
import { toLocaleDateStringUTC } from '@/lib/date-utils';

interface Vente {
  id: string;
  titre: string;
  prix: number;
  vendu_at: string;
  types_avion: { nom: string } | null;
  vendeur: { identifiant: string } | null;
  compagnie_vendeur: { nom: string } | null;
  acheteur: { identifiant: string } | null;
  compagnie_acheteur: { nom: string } | null;
}

interface Props {
  taxeActuelle: number;
  dernieresVentes: Vente[];
}

export default function AdminHangarMarketClient({ taxeActuelle, dernieresVentes }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [taxe, setTaxe] = useState(taxeActuelle.toString());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSave() {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/hangar-market/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxe_vente_pourcent: parseFloat(taxe) })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setMessage('Taxe mise à jour !');
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Configuration taxe */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Percent className="h-5 w-5 text-amber-400" />
          Taxe de vente
        </h3>
        <p className="text-sm text-slate-400 mb-4">
          Cette taxe est prélevée sur le prix d&apos;achat et payée par l&apos;acheteur. Le vendeur reçoit le prix affiché.
        </p>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={taxe}
              onChange={(e) => setTaxe(e.target.value)}
              className="w-24 p-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-center"
            />
            <span className="text-slate-400">%</span>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>

          {message && (
            <span className={`text-sm ${message.includes('Erreur') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </span>
          )}
        </div>

        <div className="mt-4 p-3 bg-slate-900 rounded-lg">
          <p className="text-sm text-slate-400">
            Exemple : Un avion vendu à <span className="text-amber-400">100 000 F$</span> avec une taxe de <span className="text-amber-400">{taxe}%</span>
          </p>
          <p className="text-sm text-slate-300 mt-1">
            → L&apos;acheteur paie : <span className="font-bold text-amber-400">{Math.round(100000 * (1 + parseFloat(taxe || '0') / 100)).toLocaleString('fr-FR')} F$</span>
          </p>
          <p className="text-sm text-slate-300">
            → Le vendeur reçoit : <span className="font-bold text-green-400">100 000 F$</span>
          </p>
          <p className="text-sm text-slate-300">
            → Taxe prélevée : <span className="font-bold text-red-400">{Math.round(100000 * parseFloat(taxe || '0') / 100).toLocaleString('fr-FR')} F$</span>
          </p>
        </div>
      </div>

      {/* Dernières ventes */}
      <div className="card">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Dernières ventes</h3>

        {dernieresVentes.length === 0 ? (
          <p className="text-slate-400">Aucune vente pour le moment</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                  <th className="pb-2">Avion</th>
                  <th className="pb-2">Vendeur</th>
                  <th className="pb-2"></th>
                  <th className="pb-2">Acheteur</th>
                  <th className="pb-2 text-right">Prix</th>
                  <th className="pb-2 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {dernieresVentes.map((vente) => (
                  <tr key={vente.id} className="border-b border-slate-800">
                    <td className="py-2">
                      <p className="font-medium">{vente.titre}</p>
                      <p className="text-sm text-slate-500">{vente.types_avion?.nom}</p>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {vente.compagnie_vendeur ? (
                          <>
                            <Building2 className="h-4 w-4 text-sky-400" />
                            <span>{vente.compagnie_vendeur.nom}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-4 w-4 text-emerald-400" />
                            <span>{vente.vendeur?.identifiant || '?'}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      <ArrowRight className="h-4 w-4 text-slate-600" />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {vente.compagnie_acheteur ? (
                          <>
                            <Building2 className="h-4 w-4 text-sky-400" />
                            <span>{vente.compagnie_acheteur.nom}</span>
                          </>
                        ) : (
                          <>
                            <User className="h-4 w-4 text-emerald-400" />
                            <span>{vente.acheteur?.identifiant || '?'}</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-amber-400">
                      {vente.prix.toLocaleString('fr-FR')} F$
                    </td>
                    <td className="py-2 text-right text-sm text-slate-500">
                      {toLocaleDateStringUTC(vente.vendu_at)} UTC
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
