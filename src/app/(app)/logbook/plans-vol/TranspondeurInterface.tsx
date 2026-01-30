'use client';

import { useState, useEffect } from 'react';
import { Radio, Clock, AlertTriangle, Plane, ArrowRight, CheckCircle2 } from 'lucide-react';

// Codes d'urgence
const EMERGENCY_CODES: Record<string, { label: string; description: string; color: string }> = {
  '7500': { label: 'DÉTOURNEMENT', description: 'Avion détourné (hijack)', color: 'bg-red-600' },
  '7600': { label: 'PANNE RADIO', description: 'Panne de communication radio', color: 'bg-orange-600' },
  '7700': { label: 'URGENCE', description: 'Situation d\'urgence générale', color: 'bg-red-600' },
};

interface TranspondeurInterfaceProps {
  planId: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  codeTranspondeur: string | null;
  modeTranspondeur: string;
  acceptedAt: string | null;
  statut: string;
}

export default function TranspondeurInterface({
  planId,
  numeroVol,
  aeroportDepart,
  aeroportArrivee,
  codeTranspondeur: initialCode,
  modeTranspondeur: initialMode,
  acceptedAt,
  statut,
}: TranspondeurInterfaceProps) {
  const [code, setCode] = useState(initialCode || '');
  const [mode, setMode] = useState(initialMode || 'C');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Mise à jour de l'heure chaque seconde
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Validation du code (0-7 uniquement)
  const validateCode = (value: string): boolean => {
    if (value.length !== 4) return false;
    return /^[0-7]{4}$/.test(value);
  };

  // Gérer la saisie du code
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-7]/g, '').slice(0, 4);
    setCode(value);
    setError('');
    setSuccess(false);
  };

  // Sauvegarder le code transpondeur
  const saveCode = async () => {
    if (!validateCode(code)) {
      setError('Code invalide. Utilisez 4 chiffres de 0 à 7.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch(`/api/plans-vol/${planId}/transpondeur`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_transpondeur: code, mode_transpondeur: mode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la sauvegarde');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Vérifier si c'est un code d'urgence
  const emergencyInfo = EMERGENCY_CODES[code];
  const isEmergency = !!emergencyInfo;

  // Format de l'heure UTC
  const formatTime = (date: Date) => {
    return date.toISOString().slice(11, 19);
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border-2 ${isEmergency ? 'border-red-500 animate-pulse' : 'border-emerald-500/50'} bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 shadow-2xl`}>
      {/* Fond radar animé */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]">
          <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute inset-[20%] rounded-full border border-emerald-500/20" />
          <div className="absolute inset-[40%] rounded-full border border-emerald-500/10" />
        </div>
      </div>

      <div className="relative space-y-6">
        {/* En-tête avec heure */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20">
              <Radio className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Vol en cours</h2>
              <p className="text-emerald-400/80 text-sm">Transpondeur actif</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-emerald-400">
              <Clock className="h-4 w-4" />
              <span className="font-mono text-2xl">{formatTime(currentTime)}</span>
              <span className="text-xs text-emerald-400/60">UTC</span>
            </div>
            {acceptedAt && (
              <p className="text-slate-500 text-xs mt-1">
                Accepté à {new Date(acceptedAt).toISOString().slice(11, 16)} UTC
              </p>
            )}
          </div>
        </div>

        {/* Info vol */}
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-mono text-2xl font-bold text-white">{numeroVol}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                statut === 'en_cours' ? 'bg-sky-500/20 text-sky-400' :
                statut === 'accepte' ? 'bg-emerald-500/20 text-emerald-400' :
                'bg-amber-500/20 text-amber-400'
              }`}>
                {statut === 'en_cours' ? 'EN VOL' : statut === 'accepte' ? 'ACCEPTÉ' : statut.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg text-sky-400">{aeroportDepart}</span>
              <ArrowRight className="h-4 w-4 text-slate-500" />
              <span className="font-mono text-lg text-emerald-400">{aeroportArrivee}</span>
            </div>
          </div>
        </div>

        {/* Interface transpondeur */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Code transpondeur */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-400 uppercase tracking-wide">
              Code Transpondeur (Squawk)
            </label>
            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={handleCodeChange}
                placeholder="0000"
                maxLength={4}
                className={`w-full text-center font-mono text-4xl font-bold py-4 rounded-xl border-2 bg-slate-900/50 transition-all ${
                  isEmergency 
                    ? 'border-red-500 text-red-400 animate-pulse' 
                    : code.length === 4 
                      ? 'border-emerald-500 text-emerald-400' 
                      : 'border-slate-600 text-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-emerald-500/50`}
              />
              {isEmergency && (
                <div className="absolute -top-2 -right-2">
                  <AlertTriangle className="h-6 w-6 text-red-500 animate-bounce" />
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Chiffres de 0 à 7 uniquement • 4096 codes possibles
            </p>
          </div>

          {/* Mode transpondeur */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-400 uppercase tracking-wide">
              Mode Transpondeur
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'A', label: 'Mode A', desc: 'Identification' },
                { id: 'C', label: 'Mode C', desc: 'Altitude' },
                { id: 'S', label: 'Mode S', desc: 'Sélectif' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    mode === m.id
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                      : 'border-slate-600 bg-slate-800/50 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="font-mono text-xl font-bold">{m.id}</span>
                  <p className="text-xs mt-1 opacity-80">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Alerte code d'urgence */}
        {isEmergency && (
          <div className={`${emergencyInfo.color} rounded-xl p-4 animate-pulse`}>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-white" />
              <div>
                <p className="font-bold text-white text-lg">{emergencyInfo.label}</p>
                <p className="text-white/80 text-sm">{emergencyInfo.description}</p>
              </div>
            </div>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Succès */}
        {success && (
          <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-xl p-3 text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Code transpondeur mis à jour
          </div>
        )}

        {/* Bouton sauvegarder */}
        <button
          onClick={saveCode}
          disabled={isSaving || code.length !== 4}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold transition-all flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Enregistrement...
            </>
          ) : (
            <>
              <Radio className="h-4 w-4" />
              Transmettre le code
            </>
          )}
        </button>

        {/* Info codes spéciaux */}
        <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Codes d&apos;urgence</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <span className="font-mono font-bold text-red-400">7500</span>
              <p className="text-slate-500">Détournement</p>
            </div>
            <div className="text-center">
              <span className="font-mono font-bold text-orange-400">7600</span>
              <p className="text-slate-500">Panne radio</p>
            </div>
            <div className="text-center">
              <span className="font-mono font-bold text-red-400">7700</span>
              <p className="text-slate-500">Urgence</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
