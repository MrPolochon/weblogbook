'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, RefreshCw, Percent, User, Building2, ArrowRight, Check, X, Clock } from 'lucide-react';
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

interface DemandeRevente {
  id: string;
  demandeur: { id: string; identifiant: string } | null;
  compagnie: { id: string; nom: string } | null;
  type_avion_id: string;
  prix_initial: number;
  pourcentage_demande: number;
  montant_revente: number;
  raison: string | null;
  statut: string;
  created_at: string;
  traite_at: string | null;
  admin_profile: { id: string; identifiant: string } | null;
  admin_commentaire: string | null;
}

interface Props {
  taxeActuelle: number;
  dernieresVentes: Vente[];
  demandesRevente: DemandeRevente[];
}

export default function AdminHangarMarketClient({ taxeActuelle, dernieresVentes, demandesRevente }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [taxe, setTaxe] = useState(taxeActuelle.toString());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [reventeLoading, setReventeLoading] = useState<string | null>(null);
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});

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

  async function handleReventeAction(demandeId: string, action: 'approuver_revente' | 'refuser_revente') {
    setReventeLoading(demandeId);
    try {
      const res = await fetch('/api/hangar-market/revente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          demande_id: demandeId,
          commentaire: commentaires[demandeId] || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setMessage(data.message || 'Action effectuée');
      startTransition(() => router.refresh());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setReventeLoading(null);
    }
  }

  const demandesEnAttente = demandesRevente.filter(d => d.statut === 'en_attente');
  const demandesTraitees = demandesRevente.filter(d => d.statut !== 'en_attente');

  return (
    <div className="space-y-6">
      {/* Demandes de revente en attente */}
      {demandesEnAttente.length > 0 && (
        <div className="card border-amber-500/30">
          <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-400" />
            Demandes de revente en attente ({demandesEnAttente.length})
          </h3>
          <div className="space-y-4">
            {demandesEnAttente.map((d) => (
              <div key={d.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-slate-100">
                      {d.demandeur?.identifiant || 'Inconnu'}
                      {d.compagnie && <span className="text-sky-400 ml-2">({d.compagnie.nom})</span>}
                    </p>
                    <p className="text-sm text-slate-400">
                      {toLocaleDateStringUTC(d.created_at)} UTC
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-amber-400">{d.pourcentage_demande}%</p>
                    <p className="text-sm text-emerald-400 font-mono">{d.montant_revente.toLocaleString('fr-FR')} F$</p>
                    <p className="text-xs text-slate-500">au lieu de {Math.round(d.prix_initial * 50 / 100).toLocaleString('fr-FR')} F$ (50%)</p>
                  </div>
                </div>
                {d.raison && (
                  <div className="p-3 bg-slate-800 rounded-lg mb-3">
                    <p className="text-xs text-slate-500 mb-1">Raison :</p>
                    <p className="text-sm text-slate-300">{d.raison}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Commentaire (optionnel)"
                    value={commentaires[d.id] || ''}
                    onChange={(e) => setCommentaires(prev => ({ ...prev, [d.id]: e.target.value }))}
                    className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder-slate-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReventeAction(d.id, 'approuver_revente')}
                      disabled={reventeLoading === d.id}
                      className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
                    >
                      {reventeLoading === d.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Approuver
                    </button>
                    <button
                      onClick={() => handleReventeAction(d.id, 'refuser_revente')}
                      disabled={reventeLoading === d.id}
                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
                    >
                      {reventeLoading === d.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                      Refuser
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique demandes traitées */}
      {demandesTraitees.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Historique des demandes de revente</h3>
          <div className="space-y-2">
            {demandesTraitees.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg text-sm">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${d.statut === 'executee' ? 'bg-emerald-400' : d.statut === 'approuvee' ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className="text-slate-200">{d.demandeur?.identifiant}</span>
                  <span className="text-slate-500">—</span>
                  <span className="text-amber-400">{d.pourcentage_demande}%</span>
                  <span className="text-slate-500">—</span>
                  <span className="text-emerald-400 font-mono">{d.montant_revente.toLocaleString('fr-FR')} F$</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    d.statut === 'executee' ? 'bg-emerald-500/20 text-emerald-300' :
                    d.statut === 'approuvee' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {d.statut === 'executee' ? 'Exécutée' : d.statut === 'approuvee' ? 'Approuvée' : 'Refusée'}
                  </span>
                  {d.traite_at && <span className="text-slate-500 text-xs">{toLocaleDateStringUTC(d.traite_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
