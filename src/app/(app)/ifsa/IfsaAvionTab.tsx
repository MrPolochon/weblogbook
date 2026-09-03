'use client';

import { useState } from 'react';
import {
  AlertTriangle, BookOpen, Calendar, Hash, Loader2, MapPin, Plane,
  Search, Sparkles, Timer, User, Wrench, XCircle,
} from 'lucide-react';
import { formatDateMediumUTC, formatTimeUTC } from '@/lib/date-utils';
import { isAvionCompagnieAuSol } from '@/lib/compagnie-utils';
import { formatDuree } from '@/lib/utils';

interface IfsaAvionData {
  avion: {
    id: string;
    immatriculation: string;
    nom_bapteme: string | null;
    usure_percent: number;
    aeroport_actuel: string;
    statut: string;
    detruit: boolean;
    detruit_at: string | null;
    detruit_raison: string | null;
    created_at: string;
    updated_at: string | null;
    source: 'compagnie' | 'personnel';
  };
  typeAvion: { id: string; nom: string; constructeur: string; prix: number } | null;
  proprietaire: { type: 'compagnie' | 'personnel'; nom: string; id: string } | null;
  plansVol: Array<{
    id: string;
    numero_vol: string;
    statut: string;
    aeroport_depart: string;
    aeroport_arrivee: string;
    type_vol: string;
    vol_commercial: boolean;
    vol_ferry: boolean;
    vol_militaire: boolean;
    heure_depart_estimee: string | null;
    heure_depart_reelle: string | null;
    heure_arrivee_estimee: string | null;
    heure_arrivee_reelle: string | null;
    duree_estimee_minutes: number | null;
    callsign: string | null;
    nature_transport: string | null;
    created_at: string;
    pilote: { id: string; identifiant: string } | null;
    copilote: { id: string; identifiant: string } | null;
    compagnie: { id: string; nom: string } | null;
  }>;
  plansNonClotures: Array<{
    id: string;
    numero_vol: string;
    statut: string;
    aeroport_depart: string;
    aeroport_arrivee: string;
    pilote: { id: string; identifiant: string } | null;
    copilote: { id: string; identifiant: string } | null;
    created_at: string;
  }>;
  totalMinutesVol: number;
  reparations: Array<{ id: string; libelle: string; montant: number; type: string; created_at: string }>;
}

export default function IfsaAvionTab() {
  const [avionSearchImmat, setAvionSearchImmat] = useState('');
  const [avionData, setAvionData] = useState<IfsaAvionData | null>(null);
  const [loadingAvion, setLoadingAvion] = useState(false);
  const [avionError, setAvionError] = useState('');

  async function searchAvion() {
    const immat = avionSearchImmat.trim().toUpperCase();
    if (!immat || immat.length < 2) {
      setAvionError('Immatriculation requise (min 2 caractères)');
      return;
    }
    setLoadingAvion(true);
    setAvionError('');
    setAvionData(null);
    try {
      const res = await fetch(`/api/ifsa/avion?immatriculation=${encodeURIComponent(immat)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setAvionData(data);
    } catch (err) {
      setAvionError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoadingAvion(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Recherche par immatriculation
        </h2>
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={avionSearchImmat}
              onChange={(e) => setAvionSearchImmat(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') searchAvion(); }}
              placeholder="Ex: F-HZUK, IR-A320-01..."
              className="input w-full pl-10 font-mono uppercase"
            />
          </div>
          <button
            onClick={searchAvion}
            disabled={loadingAvion}
            className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white rounded-lg font-medium shadow-md shadow-indigo-900/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            {loadingAvion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Rechercher
          </button>
        </div>
        {avionError && (
          <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2 animate-fade-in">
            <XCircle className="h-4 w-4" />
            {avionError}
          </div>
        )}
        {!avionData && !loadingAvion && !avionError && (
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Entrez une immatriculation pour consulter la fiche complète : type, propriétaire, historique de vols, état mécanique et réparations.
          </p>
        )}
      </div>

      {loadingAvion && (
        <div className="card animate-fade-in">
          <div className="space-y-4">
            <div className="skeleton h-12 w-2/3"></div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="skeleton h-16"></div>
              <div className="skeleton h-16"></div>
              <div className="skeleton h-16"></div>
              <div className="skeleton h-16"></div>
            </div>
            <div className="skeleton h-48 w-full"></div>
          </div>
        </div>
      )}

      {avionData && !loadingAvion && (
        <>
          <div className="card animate-reveal-blur">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-slate-100 font-mono">{avionData.avion.immatriculation}</h2>
                  {avionData.avion.nom_bapteme && (
                    <span className="text-sm text-slate-400 italic">&laquo; {avionData.avion.nom_bapteme} &raquo;</span>
                  )}
                </div>
                <p className="text-sm text-slate-400">
                  {avionData.typeAvion ? `${avionData.typeAvion.constructeur} ${avionData.typeAvion.nom}` : 'Type inconnu'}
                  {avionData.typeAvion?.prix ? ` — Prix neuf : ${avionData.typeAvion.prix.toLocaleString('fr-FR')} F$` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  avionData.avion.detruit ? 'bg-red-500/20 text-red-400' :
                  isAvionCompagnieAuSol(avionData.avion.statut) ? 'bg-emerald-500/20 text-emerald-400' :
                  avionData.avion.statut === 'in_flight' ? 'bg-sky-500/20 text-sky-400' :
                  avionData.avion.statut === 'maintenance' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {avionData.avion.detruit ? 'Détruit' :
                   isAvionCompagnieAuSol(avionData.avion.statut) ? 'Au sol' :
                   avionData.avion.statut === 'in_flight' ? 'En vol' :
                   avionData.avion.statut === 'maintenance' ? 'Maintenance' :
                   'Bloqué'}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  avionData.avion.source === 'compagnie' ? 'bg-purple-500/20 text-purple-400' : 'bg-sky-500/20 text-sky-400'
                }`}>
                  {avionData.avion.source === 'compagnie' ? 'Flotte compagnie' : 'Avion personnel'}
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 flex items-center gap-1"><User className="h-3 w-3" /> Propriétaire</p>
                <p className="text-sm font-medium text-slate-200 mt-1">
                  {avionData.proprietaire?.nom || 'Inconnu'}
                  <span className="text-xs text-slate-500 ml-1">
                    ({avionData.proprietaire?.type === 'compagnie' ? 'Compagnie' : 'Personnel'})
                  </span>
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" /> Position actuelle</p>
                <p className="text-sm font-medium text-slate-200 mt-1 font-mono">{avionData.avion.aeroport_actuel}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Wrench className="h-3 w-3" /> État / Usure</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 bg-slate-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        avionData.avion.usure_percent > 70 ? 'bg-emerald-400' :
                        avionData.avion.usure_percent > 30 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${avionData.avion.usure_percent}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-200">{avionData.avion.usure_percent}%</span>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Timer className="h-3 w-3" /> Heures de vol</p>
                <p className="text-sm font-medium text-slate-200 mt-1">{formatDuree(avionData.totalMinutesVol)}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" /> Date d&apos;acquisition</p>
                <p className="text-sm text-slate-200 mt-1">{formatDateMediumUTC(avionData.avion.created_at)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Plans de vol totaux</p>
                <p className="text-sm text-slate-200 mt-1">{avionData.plansVol.length} plans de vol enregistrés</p>
              </div>
            </div>

            {avionData.avion.detruit && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm font-medium text-red-400">Avion détruit</p>
                {avionData.avion.detruit_at && (
                  <p className="text-xs text-red-300/70 mt-1">Le {formatDateMediumUTC(avionData.avion.detruit_at)}</p>
                )}
                {avionData.avion.detruit_raison && (
                  <p className="text-xs text-red-300/70 mt-1">Raison : {avionData.avion.detruit_raison}</p>
                )}
              </div>
            )}
          </div>

          {avionData.plansNonClotures.length > 0 && (
            <div className="card border-amber-500/30">
              <h3 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Plans de vol non clôturés ({avionData.plansNonClotures.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700/40 text-xs">
                      <th className="py-2 pr-3">N° Vol</th>
                      <th className="py-2 pr-3">Statut</th>
                      <th className="py-2 pr-3">Départ</th>
                      <th className="py-2 pr-3">Arrivée</th>
                      <th className="py-2 pr-3">Pilote</th>
                      <th className="py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avionData.plansNonClotures.map((p) => (
                      <tr key={p.id} className="border-b border-slate-800/40">
                        <td className="py-2 pr-3 text-amber-300 font-mono">{p.numero_vol}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            p.statut === 'depose' ? 'bg-blue-500/20 text-blue-400' :
                            p.statut === 'en_attente' ? 'bg-amber-500/20 text-amber-400' :
                            p.statut === 'accepte' ? 'bg-emerald-500/20 text-emerald-400' :
                            p.statut === 'en_cours' ? 'bg-sky-500/20 text-sky-400' :
                            p.statut === 'automonitoring' ? 'bg-purple-500/20 text-purple-400' :
                            p.statut === 'en_attente_cloture' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {p.statut.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-slate-300">{p.aeroport_depart}</td>
                        <td className="py-2 pr-3 text-slate-300">{p.aeroport_arrivee}</td>
                        <td className="py-2 pr-3 text-slate-300">{p.pilote?.identifiant || '—'}</td>
                        <td className="py-2 text-slate-400 text-xs">{formatDateMediumUTC(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-sky-400" />
              Historique des vols ({avionData.plansVol.length})
            </h3>
            {avionData.plansVol.length === 0 ? (
              <p className="text-slate-400 text-sm">Aucun plan de vol enregistré pour cet avion.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-700/40">
                      <th className="py-2 pr-2">N° Vol</th>
                      <th className="py-2 pr-2">Statut</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Départ</th>
                      <th className="py-2 pr-2">Arrivée</th>
                      <th className="py-2 pr-2">Pilote</th>
                      <th className="py-2 pr-2">Copilote</th>
                      <th className="py-2 pr-2">Compagnie</th>
                      <th className="py-2 pr-2">Callsign</th>
                      <th className="py-2 pr-2">Départ réel</th>
                      <th className="py-2 pr-2">Arrivée réelle</th>
                      <th className="py-2">Date dépôt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avionData.plansVol.map((p) => {
                      const isCloture = p.statut === 'cloture';
                      const isNonCloture = !['cloture', 'refuse', 'annule'].includes(p.statut);
                      return (
                        <tr key={p.id} className={`border-b border-slate-800/40 ${isNonCloture ? 'bg-amber-500/5' : ''}`}>
                          <td className="py-1.5 pr-2 text-slate-200 font-mono">{p.numero_vol}</td>
                          <td className="py-1.5 pr-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              isCloture ? 'bg-emerald-500/20 text-emerald-400' :
                              p.statut === 'refuse' ? 'bg-red-500/20 text-red-400' :
                              p.statut === 'annule' ? 'bg-slate-500/20 text-slate-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {p.statut.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-slate-400">
                            {p.vol_ferry ? 'Ferry' : p.vol_militaire ? 'Militaire' : p.vol_commercial ? 'Commercial' : p.type_vol}
                          </td>
                          <td className="py-1.5 pr-2 text-slate-300 font-mono">{p.aeroport_depart}</td>
                          <td className="py-1.5 pr-2 text-slate-300 font-mono">{p.aeroport_arrivee}</td>
                          <td className="py-1.5 pr-2 text-slate-300">{p.pilote?.identifiant || '—'}</td>
                          <td className="py-1.5 pr-2 text-slate-300">{p.copilote?.identifiant || '—'}</td>
                          <td className="py-1.5 pr-2 text-slate-300">{p.compagnie?.nom || '—'}</td>
                          <td className="py-1.5 pr-2 text-slate-400 font-mono">{p.callsign || '—'}</td>
                          <td className="py-1.5 pr-2 text-slate-400">
                            {p.heure_depart_reelle ? `${formatDateMediumUTC(p.heure_depart_reelle)} ${formatTimeUTC(p.heure_depart_reelle)}` : '—'}
                          </td>
                          <td className="py-1.5 pr-2 text-slate-400">
                            {p.heure_arrivee_reelle ? `${formatDateMediumUTC(p.heure_arrivee_reelle)} ${formatTimeUTC(p.heure_arrivee_reelle)}` : '—'}
                          </td>
                          <td className="py-1.5 text-slate-500">{formatDateMediumUTC(p.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {avionData.reparations.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-amber-400" />
                Historique maintenance / réparations ({avionData.reparations.length})
              </h3>
              <div className="space-y-2">
                {avionData.reparations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm border-b border-slate-700/40 pb-2">
                    <div className="flex-1">
                      <p className="text-slate-300">{r.libelle}</p>
                      <p className="text-xs text-slate-500">{formatDateMediumUTC(r.created_at)}</p>
                    </div>
                    <span className={`font-medium ${r.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.type === 'credit' ? '+' : '-'}{Math.abs(r.montant).toLocaleString('fr-FR')} F$
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
