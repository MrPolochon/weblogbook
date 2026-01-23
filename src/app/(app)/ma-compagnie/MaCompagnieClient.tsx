'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, Plane, Crown, Clock, Settings, DollarSign, Save, RefreshCw, ChevronDown, Route } from 'lucide-react';
import Link from 'next/link';
import TarifsLiaisonsClient from './TarifsLiaisonsClient';

interface CompagnieOption {
  id: string;
  nom: string;
  role: 'employe' | 'pdg';
}

interface Compagnie {
  id: string;
  nom: string;
  code_oaci: string | null;
  vban: string | null;
  pdg_identifiant: string;
  pourcentage_salaire: number;
  prix_billet_pax: number;
  prix_kg_cargo: number;
}

interface Employe {
  id: string;
  piloteId: string;
  identifiant: string;
  heures: number;
}

interface FlotteItem {
  id: string;
  nom: string;
  code_oaci: string | null;
  quantite: number;
  en_vol: number;
  disponibles: number;
}

interface Props {
  compagniesDisponibles: CompagnieOption[];
  selectedCompagnieId: string;
  compagnie: Compagnie;
  employes: Employe[];
  flotte: FlotteItem[];
  isPdg: boolean;
}

function formatHeures(minutes: number): string {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function MaCompagnieClient({ 
  compagniesDisponibles, 
  selectedCompagnieId, 
  compagnie, 
  employes, 
  flotte,
  isPdg 
}: Props) {
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);
  const [pourcentageSalaire, setPourcentageSalaire] = useState(compagnie.pourcentage_salaire.toString());
  const [prixBillet, setPrixBillet] = useState(compagnie.prix_billet_pax.toString());
  const [prixCargo, setPrixCargo] = useState(compagnie.prix_kg_cargo.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handleCompagnieChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(`/ma-compagnie?c=${e.target.value}`);
  }

  async function handleSaveSettings() {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await fetch(`/api/compagnies/${compagnie.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pourcentage_salaire: parseInt(pourcentageSalaire) || 20,
          prix_billet_pax: parseInt(prixBillet) || 100,
          prix_kg_cargo: parseInt(prixCargo) || 5,
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess('Paramètres sauvegardés');
      setTimeout(() => setSuccess(''), 3000);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-sky-400" />
          {compagniesDisponibles.length > 1 ? (
            <select
              value={selectedCompagnieId}
              onChange={handleCompagnieChange}
              className="text-2xl font-bold text-slate-100 bg-transparent border-none cursor-pointer hover:text-sky-300 transition-colors appearance-none pr-8"
              style={{ backgroundImage: 'none' }}
            >
              {compagniesDisponibles.map(c => (
                <option key={c.id} value={c.id} className="bg-slate-800 text-slate-100">
                  {c.nom} {c.role === 'pdg' ? '(PDG)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="text-2xl font-bold text-slate-100">{compagnie.nom}</h1>
          )}
          {compagniesDisponibles.length > 1 && (
            <ChevronDown className="h-5 w-5 text-slate-400 -ml-6 pointer-events-none" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPdg && (
            <>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  showSettings 
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <Settings className="h-4 w-4" />
                Paramètres
              </button>
              <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-300 rounded-full text-sm font-medium">
                <Crown className="h-4 w-4" />
                PDG
              </span>
            </>
          )}
        </div>
      </div>

      {/* Paramètres PDG */}
      {isPdg && showSettings && (
        <div className="card border-sky-500/30 bg-sky-500/5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-sky-400" />
            Paramètres de la compagnie
          </h2>
          
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          {success && <p className="text-emerald-400 text-sm mb-3">{success}</p>}
          
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                Salaire pilotes (%)
              </label>
              <input
                type="number"
                value={pourcentageSalaire}
                onChange={(e) => setPourcentageSalaire(e.target.value)}
                min="0"
                max="100"
                className="input w-full"
              />
              <p className="text-xs text-slate-500 mt-1">% du revenu reversé aux pilotes</p>
            </div>
            <div>
              <label className="label flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-400" />
                Prix billet passager (F$)
              </label>
              <input
                type="number"
                value={prixBillet}
                onChange={(e) => setPrixBillet(e.target.value)}
                min="1"
                className="input w-full"
              />
            </div>
            <div>
              <label className="label flex items-center gap-2">
                <Plane className="h-4 w-4 text-amber-400" />
                Prix cargo/kg (F$)
              </label>
              <input
                type="number"
                value={prixCargo}
                onChange={(e) => setPrixCargo(e.target.value)}
                min="1"
                className="input w-full"
              />
            </div>
          </div>
          
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="btn-primary mt-4 flex items-center gap-2"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Sauvegarder
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Infos compagnie */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-sky-400" />
            Informations
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-400">Nom</p>
              <p className="text-slate-200 font-medium">{compagnie.nom}</p>
            </div>
            {compagnie.code_oaci && (
              <div>
                <p className="text-sm text-slate-400">Code OACI</p>
                <p className="text-slate-200 font-mono">{compagnie.code_oaci}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-slate-400">PDG</p>
              <p className="text-slate-200 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" />
                {compagnie.pdg_identifiant}
              </p>
            </div>
            {compagnie.vban && (
              <div>
                <p className="text-sm text-slate-400">VBAN Entreprise</p>
                <p className="text-slate-200 font-mono text-sm break-all">{compagnie.vban}</p>
              </div>
            )}
            <div className="pt-2 border-t border-slate-700">
              <p className="text-sm text-slate-400">Tarification</p>
              <div className="flex gap-4 mt-1">
                <span className="text-slate-300 text-sm">
                  <span className="text-emerald-400">{compagnie.pourcentage_salaire}%</span> salaire pilotes
                </span>
                <span className="text-slate-300 text-sm">
                  <span className="text-sky-400">{compagnie.prix_billet_pax} F$</span>/pax
                </span>
                <span className="text-slate-300 text-sm">
                  <span className="text-amber-400">{compagnie.prix_kg_cargo} F$</span>/kg
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des pilotes */}
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-400" />
            Pilotes ({employes.length})
          </h2>
          {employes.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {employes.map((emp) => (
                <div 
                  key={emp.id} 
                  className="flex items-center justify-between bg-slate-800/30 rounded-lg p-3 border border-slate-700/30"
                >
                  <span className="text-slate-200 font-medium">{emp.identifiant}</span>
                  <span className="text-sm text-slate-400 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatHeures(emp.heures)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Aucun pilote employé.</p>
          )}
        </div>
      </div>

      {/* Flotte */}
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Flotte ({flotte.length} types d&apos;appareil)
        </h2>
        {flotte.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th className="pb-2 pr-4">Appareil</th>
                  <th className="pb-2 pr-4">Quantité</th>
                  <th className="pb-2 pr-4">En vol</th>
                  <th className="pb-2">Disponibles</th>
                </tr>
              </thead>
              <tbody>
                {flotte.map((item) => (
                  <tr key={item.id} className="border-b border-slate-700/50 last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="text-slate-200 font-medium">{item.nom}</span>
                      {item.code_oaci && (
                        <span className="ml-2 text-xs text-slate-500 font-mono">
                          ({item.code_oaci})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{item.quantite}</td>
                    <td className="py-2.5 pr-4">
                      {item.en_vol > 0 ? (
                        <span className="text-amber-400">{item.en_vol}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className={item.disponibles > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {item.disponibles}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">Aucun appareil dans la flotte.</p>
        )}
      </div>

      {/* Tarifs par liaison (PDG uniquement) */}
      {isPdg && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
            <Route className="h-5 w-5 text-amber-400" />
            Tarifs par liaison
          </h2>
          <TarifsLiaisonsClient 
            compagnieId={compagnie.id} 
            prixBilletDefaut={compagnie.prix_billet_pax} 
          />
        </div>
      )}

      {/* Lien vers Felitz Bank si PDG */}
      {isPdg && (
        <Link 
          href="/felitz-bank"
          className="card hover:bg-slate-800/70 transition-colors flex items-center gap-4"
        >
          <div className="p-3 rounded-lg bg-emerald-500/20">
            <DollarSign className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-200">Gérer les finances</p>
            <p className="text-sm text-slate-400">Accéder au compte Felitz Bank de la compagnie</p>
          </div>
        </Link>
      )}
    </div>
  );
}
