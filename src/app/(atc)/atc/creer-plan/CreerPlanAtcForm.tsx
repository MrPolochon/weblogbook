'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { Plane, Search, User, Clock, CheckCircle2 } from 'lucide-react';

interface Pilote {
  id: string;
  identifiant: string;
}

interface Props {
  sessionAeroport: string;
  sessionPosition: string;
}

export default function CreerPlanAtcForm({ sessionAeroport, sessionPosition }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Recherche pilote
  const [searchPilote, setSearchPilote] = useState('');
  const [pilotesRecherche, setPilotesRecherche] = useState<Pilote[]>([]);
  const [selectedPilote, setSelectedPilote] = useState<Pilote | null>(null);
  const [searchingPilote, setSearchingPilote] = useState(false);

  // Champs du plan de vol
  const [aeroport_depart, setAeroportDepart] = useState(sessionAeroport);
  const [aeroport_arrivee, setAeroportArrivee] = useState('');
  const [numero_vol, setNumeroVol] = useState('');
  const [porte, setPorte] = useState('');
  const [temps_prev_min, setTempsPrevMin] = useState('');
  const [type_vol, setTypeVol] = useState<'VFR' | 'IFR'>('VFR');
  const [intentions_vol, setIntentionsVol] = useState('');
  const [sid_depart, setSidDepart] = useState('');
  const [star_arrivee, setStarArrivee] = useState('');
  const [route_ifr, setRouteIfr] = useState('');
  const [note_atc, setNoteAtc] = useState('');

  // Recherche de pilotes
  async function handleSearchPilote(query: string) {
    setSearchPilote(query);
    if (query.length < 2) {
      setPilotesRecherche([]);
      return;
    }
    setSearchingPilote(true);
    try {
      const res = await fetch(`/api/pilotes/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setPilotesRecherche(data.filter((p: Pilote) => p.identifiant));
      }
    } catch (e) {
      console.error('Erreur recherche pilotes:', e);
    } finally {
      setSearchingPilote(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedPilote) {
      setError('Veuillez sélectionner un pilote.');
      return;
    }

    if (!aeroport_depart || !aeroport_arrivee) {
      setError('Veuillez saisir les aéroports de départ et d\'arrivée.');
      return;
    }

    if (!numero_vol.trim()) {
      setError('Veuillez saisir un numéro de vol.');
      return;
    }

    const tempsMin = parseInt(temps_prev_min);
    if (isNaN(tempsMin) || tempsMin < 1) {
      setError('Le temps prévu doit être au minimum 1 minute.');
      return;
    }

    if (type_vol === 'VFR' && !intentions_vol.trim()) {
      setError('Les intentions de vol sont requises pour un vol VFR.');
      return;
    }

    if (type_vol === 'IFR') {
      if (!sid_depart.trim()) {
        setError('La SID de départ est requise pour un vol IFR.');
        return;
      }
      if (!star_arrivee.trim()) {
        setError('La STAR d\'arrivée est requise pour un vol IFR.');
        return;
      }
    }

    setLoading(true);

    try {
      const res = await fetch('/api/atc/creer-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pilote_id: selectedPilote.id,
          aeroport_depart: aeroport_depart.toUpperCase(),
          aeroport_arrivee: aeroport_arrivee.toUpperCase(),
          numero_vol: numero_vol.trim(),
          porte: porte.trim() || null,
          temps_prev_min: tempsMin,
          type_vol,
          intentions_vol: type_vol === 'VFR' ? intentions_vol.trim() : null,
          sid_depart: type_vol === 'IFR' ? sid_depart.trim() : null,
          star_arrivee: type_vol === 'IFR' ? star_arrivee.trim() : null,
          route_ifr: type_vol === 'IFR' && route_ifr.trim() ? route_ifr.trim() : null,
          note_atc: note_atc.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(`Plan de vol ${numero_vol} créé avec succès pour ${selectedPilote.identifiant} !`);
      
      // Reset form
      setSelectedPilote(null);
      setSearchPilote('');
      setAeroportArrivee('');
      setNumeroVol('');
      setPorte('');
      setTempsPrevMin('');
      setIntentionsVol('');
      setSidDepart('');
      setStarArrivee('');
      setRouteIfr('');
      setNoteAtc('');

      // Rediriger vers le plan créé
      setTimeout(() => {
        router.push(`/atc/plan/${data.id}`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </div>
      )}

      {/* Recherche pilote */}
      <div className="card">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <User className="h-5 w-5 text-sky-600" />
          Pilote
        </h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchPilote}
            onChange={(e) => handleSearchPilote(e.target.value)}
            placeholder="Rechercher un pilote par identifiant..."
            className="input w-full pl-10"
            disabled={loading}
          />
        </div>
        
        {/* Résultats de recherche */}
        {pilotesRecherche.length > 0 && !selectedPilote && (
          <div className="mt-2 bg-white rounded-lg border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
            {pilotesRecherche.map((pilote) => (
              <button
                key={pilote.id}
                type="button"
                onClick={() => {
                  setSelectedPilote(pilote);
                  setSearchPilote(pilote.identifiant);
                  setPilotesRecherche([]);
                }}
                className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {pilote.identifiant}
              </button>
            ))}
          </div>
        )}
        
        {searchingPilote && (
          <p className="text-sm text-slate-500 mt-2">Recherche en cours...</p>
        )}

        {/* Pilote sélectionné */}
        {selectedPilote && (
          <div className="mt-2 flex items-center gap-2 bg-emerald-100 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-emerald-700 font-medium">{selectedPilote.identifiant}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedPilote(null);
                setSearchPilote('');
              }}
              className="ml-auto text-slate-500 hover:text-slate-700 text-sm"
            >
              Changer
            </button>
          </div>
        )}
      </div>

      {/* Informations du vol */}
      <div className="card">
        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-600" />
          Informations du vol
        </h3>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Aéroport de départ</label>
            <select
              value={aeroport_depart}
              onChange={(e) => setAeroportDepart(e.target.value)}
              className="input w-full"
              disabled={loading}
            >
              <option value="">— Sélectionner —</option>
              {AEROPORTS_PTFS.map((apt) => (
                <option key={apt.code} value={apt.code}>{apt.code} – {apt.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Aéroport d&apos;arrivée</label>
            <select
              value={aeroport_arrivee}
              onChange={(e) => setAeroportArrivee(e.target.value)}
              className="input w-full"
              disabled={loading}
            >
              <option value="">— Sélectionner —</option>
              {AEROPORTS_PTFS.map((apt) => (
                <option key={apt.code} value={apt.code}>{apt.code} – {apt.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Numéro de vol / Indicatif</label>
            <input
              type="text"
              value={numero_vol}
              onChange={(e) => setNumeroVol(e.target.value.toUpperCase())}
              placeholder="Ex: AF123 ou F-GHIJ"
              className="input w-full font-mono"
              disabled={loading}
            />
          </div>
          <div>
            <label className="label">Porte (optionnel)</label>
            <input
              type="text"
              value={porte}
              onChange={(e) => setPorte(e.target.value)}
              placeholder="Ex: A12"
              className="input w-full"
              disabled={loading}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Temps prévu (minutes)
            </label>
            <input
              type="number"
              value={temps_prev_min}
              onChange={(e) => setTempsPrevMin(e.target.value)}
              min="1"
              placeholder="30"
              className="input w-full"
              disabled={loading}
            />
          </div>
          <div>
            <label className="label">Type de vol</label>
            <select
              value={type_vol}
              onChange={(e) => setTypeVol(e.target.value as 'VFR' | 'IFR')}
              className="input w-full"
              disabled={loading}
            >
              <option value="VFR">VFR</option>
              <option value="IFR">IFR</option>
            </select>
          </div>
        </div>

        {/* Champs VFR */}
        {type_vol === 'VFR' && (
          <div className="mt-4">
            <label className="label">Intentions de vol</label>
            <textarea
              value={intentions_vol}
              onChange={(e) => setIntentionsVol(e.target.value)}
              placeholder="Décrivez le vol prévu..."
              rows={3}
              className="input w-full resize-none"
              disabled={loading}
            />
          </div>
        )}

        {/* Champs IFR */}
        {type_vol === 'IFR' && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">SID Départ</label>
                <input
                  type="text"
                  value={sid_depart}
                  onChange={(e) => setSidDepart(e.target.value.toUpperCase())}
                  placeholder="Ex: OKRIX1A"
                  className="input w-full font-mono"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="label">STAR Arrivée</label>
                <input
                  type="text"
                  value={star_arrivee}
                  onChange={(e) => setStarArrivee(e.target.value.toUpperCase())}
                  placeholder="Ex: STAR1B"
                  className="input w-full font-mono"
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <label className="label">Route IFR (optionnel)</label>
              <input
                type="text"
                value={route_ifr}
                onChange={(e) => setRouteIfr(e.target.value.toUpperCase())}
                placeholder="Ex: OKRIX DCT MOPIL DCT..."
                className="input w-full font-mono"
                disabled={loading}
              />
            </div>
          </div>
        )}

        {/* Note ATC */}
        <div className="mt-4">
          <label className="label">Note / Remarques (optionnel)</label>
          <textarea
            value={note_atc}
            onChange={(e) => setNoteAtc(e.target.value)}
            placeholder="Notes supplémentaires pour ce vol..."
            rows={2}
            className="input w-full resize-none"
            disabled={loading}
          />
        </div>
      </div>

      {/* Bouton de soumission */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading || !selectedPilote}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          {loading ? 'Création en cours...' : 'Créer le plan de vol'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-secondary"
          disabled={loading}
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
