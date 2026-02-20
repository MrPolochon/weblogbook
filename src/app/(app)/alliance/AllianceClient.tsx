'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, Building2, Plus, Crown, Settings, Landmark, Loader2 } from 'lucide-react';

interface Parametres {
  actif_vente_avions_entre_membres: boolean;
  actif_don_avions: boolean;
  actif_pret_avions: boolean;
  actif_avions_membres: boolean;
  actif_codeshare: boolean;
  actif_compte_alliance: boolean;
  actif_taxes_alliance: boolean;
  codeshare_pourcent: number;
  taxe_alliance_pourcent: number;
}

interface Alliance {
  id: string;
  nom: string;
  created_at: string;
  parametres: Parametres | null;
  my_compagnie_id: string | null;
  my_role: 'dirigeant' | 'membre' | null;
}

interface AllianceDetail extends Alliance {
  membres: Array<{ id: string; compagnie_id: string; role: string; joined_at: string; compagnie: { id: string; nom: string } | null }>;
  compte_alliance: { id: string; vban: string; solde: number } | null;
}

interface Props {
  compagniesSansAlliance: { id: string; nom: string }[];
  pdgCompagnieIds: string[];
}

export default function AllianceClient({ compagniesSansAlliance, pdgCompagnieIds }: Props) {
  const router = useRouter();
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createNom, setCreateNom] = useState('');
  const [createCompagnieId, setCreateCompagnieId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedAlliance, setSelectedAlliance] = useState<AllianceDetail | null>(null);

  const canCreate = pdgCompagnieIds.length > 0 && compagniesSansAlliance.some((c) => pdgCompagnieIds.includes(c.id));

  useEffect(() => {
    fetch('/api/alliances')
      .then((r) => r.json())
      .then((data) => { setAlliances(Array.isArray(data) ? data : []); })
      .catch(() => setAlliances([]))
      .finally(() => setLoading(false));
  }, []);

  async function loadDetail(id: string) {
    const res = await fetch(`/api/alliances/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setSelectedAlliance(data);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createNom.trim() || !createCompagnieId) return;
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/alliances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: createNom.trim(), compagnie_id: createCompagnieId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSuccess('Alliance créée. Vous en êtes le dirigeant.');
      setCreateNom('');
      setCreateCompagnieId('');
      const list = await fetch('/api/alliances').then((r) => r.json());
      setAlliances(Array.isArray(list) ? list : []);
      if (data.id) loadDetail(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Users className="h-7 w-7 text-violet-400" />
          Alliance
        </h1>
        <p className="text-slate-400 mt-1">
          Créez ou rejoignez une alliance. Les dirigeants activent les options (avions partagés, codeshare, compte commun, taxes). Tout le monde peut quitter depuis Ma compagnie.
        </p>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {success && <p className="text-emerald-400 text-sm">{success}</p>}

      {canCreate && alliances.length === 0 && (
        <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Créer une alliance</h2>
          <p className="text-slate-400 text-sm mb-4">En tant que PDG, votre compagnie deviendra la tête de l&apos;alliance (dirigeant).</p>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nom de l&apos;alliance</label>
              <input
                type="text"
                value={createNom}
                onChange={(e) => setCreateNom(e.target.value)}
                placeholder="Ex: Star Alliance"
                className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 w-48"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Compagnie à la tête</label>
              <select
                value={createCompagnieId}
                onChange={(e) => setCreateCompagnieId(e.target.value)}
                className="rounded-lg border border-slate-600 bg-slate-800 text-slate-200 px-3 py-2 min-w-[200px]"
              >
                <option value="">Choisir</option>
                {compagniesSansAlliance.filter((c) => pdgCompagnieIds.includes(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={creating || !createNom.trim() || !createCompagnieId} className="px-4 py-2 rounded-lg bg-violet-600 text-white font-medium disabled:opacity-50 flex items-center gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer l&apos;alliance
            </button>
          </form>
        </section>
      )}

      {alliances.length > 0 && (
        <section className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Votre alliance</h2>
          <ul className="space-y-3">
            {alliances.map((a) => (
              <li key={a.id} className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-100">{a.nom}</span>
                  {a.my_role === 'dirigeant' && <span title="Dirigeant"><Crown className="h-4 w-4 text-amber-400" aria-hidden /></span>}
                  {a.my_role === 'membre' && <span className="text-xs text-slate-500">membre</span>}
                </div>
                <button
                  type="button"
                  onClick={() => selectedAlliance?.id === a.id ? setSelectedAlliance(null) : loadDetail(a.id)}
                  className="text-sm text-sky-400 hover:text-sky-300"
                >
                  {selectedAlliance?.id === a.id ? 'Masquer' : 'Voir détail'}
                </button>
              </li>
            ))}
          </ul>

          {selectedAlliance && (
            <div className="mt-6 pt-6 border-t border-slate-700 space-y-4">
              <h3 className="font-medium text-slate-200">Membres</h3>
              <ul className="space-y-1">
                {(selectedAlliance.membres || []).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-slate-300">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    {m.compagnie?.nom ?? m.compagnie_id}
                    {m.role === 'dirigeant' && <Crown className="h-3 w-3 text-amber-400" />}
                  </li>
                ))}
              </ul>
              {selectedAlliance.parametres && (
                <>
                  <h3 className="font-medium text-slate-200 mt-4">Avantages activés</h3>
                  <ul className="flex flex-wrap gap-2 text-sm text-slate-400">
                    {selectedAlliance.parametres.actif_vente_avions_entre_membres && <li className="px-2 py-1 bg-slate-700/50 rounded">Vente d&apos;avions entre membres</li>}
                    {selectedAlliance.parametres.actif_don_avions && <li className="px-2 py-1 bg-slate-700/50 rounded">Don d&apos;avions entre membres</li>}
                    {selectedAlliance.parametres.actif_pret_avions && <li className="px-2 py-1 bg-slate-700/50 rounded">Prêt d&apos;avions entre membres</li>}
                    {selectedAlliance.parametres.actif_avions_membres && <li className="px-2 py-1 bg-slate-700/50 rounded">Avions pour membres (50% revenus)</li>}
                    {selectedAlliance.parametres.actif_codeshare && <li className="px-2 py-1 bg-slate-700/50 rounded">Codeshare {selectedAlliance.parametres.codeshare_pourcent}%</li>}
                    {selectedAlliance.parametres.actif_compte_alliance && <li className="px-2 py-1 bg-slate-700/50 rounded">Compte Felitz alliance</li>}
                    {selectedAlliance.parametres.actif_taxes_alliance && <li className="px-2 py-1 bg-slate-700/50 rounded">Taxes alliance {selectedAlliance.parametres.taxe_alliance_pourcent}%</li>}
                  </ul>
                </>
              )}
              {selectedAlliance.my_role === 'dirigeant' && selectedAlliance.compte_alliance && (
                <div className="mt-4 p-3 rounded-lg bg-slate-700/30 flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-violet-400" />
                  <span className="text-slate-300">Compte alliance : VBAN {selectedAlliance.compte_alliance.vban} — Solde {selectedAlliance.compte_alliance.solde.toLocaleString('fr-FR')} F$</span>
                </div>
              )}
              {selectedAlliance.my_role === 'dirigeant' && (
                <p className="text-slate-500 text-sm mt-4">Gestion complète (ajouter membres, paramètres, virements, avions membres) à venir dans une prochaine mise à jour.</p>
              )}
            </div>
          )}
        </section>
      )}

      {!loading && alliances.length === 0 && !canCreate && (
        <p className="text-slate-500">Vous n&apos;êtes dans aucune alliance. Un dirigeant doit vous ajouter depuis la section Alliance.</p>
      )}
    </div>
  );
}
