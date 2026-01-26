'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Send, Loader2, Check, X, Clock, FileText, CheckCircle2, XCircle, Search } from 'lucide-react';
import { toLocaleDateStringUTC } from '@/lib/date-utils';

interface Signalement {
  id: string;
  numero_signalement: string;
  type_signalement: string;
  titre: string;
  statut: string;
  created_at: string;
  reponse_ifsa: string | null;
}

interface Props {
  mesSignalements: Signalement[];
  pilotes: Array<{ id: string; identifiant: string }>;
  compagnies: Array<{ id: string; nom: string }>;
}

const TYPES_SIGNALEMENT = [
  { value: 'incident', label: 'Incident', description: 'Événement imprévu affectant la sécurité' },
  { value: 'plainte', label: 'Plainte', description: 'Comportement inapproprié d\'un pilote ou compagnie' },
  { value: 'infraction', label: 'Infraction', description: 'Violation des règles de l\'aviation' },
  { value: 'autre', label: 'Autre', description: 'Autre type de signalement' }
];

const STATUTS = {
  nouveau: { label: 'Nouveau', color: 'text-blue-400 bg-blue-500/20' },
  en_examen: { label: 'En examen', color: 'text-amber-400 bg-amber-500/20' },
  enquete_ouverte: { label: 'Enquête ouverte', color: 'text-purple-400 bg-purple-500/20' },
  classe: { label: 'Classé', color: 'text-emerald-400 bg-emerald-500/20' },
  rejete: { label: 'Rejeté', color: 'text-red-400 bg-red-500/20' }
};

export default function SignalementClient({ mesSignalements, pilotes, compagnies }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'nouveau' | 'mes'>('nouveau');
  
  // Formulaire
  const [typeSignalement, setTypeSignalement] = useState('incident');
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [piloteSignaleId, setPiloteSignaleId] = useState('');
  const [compagnieSignaleeId, setCompagnieSignaleeId] = useState('');
  const [preuves, setPreuves] = useState('');
  const [searchPilote, setSearchPilote] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filtre pilotes
  const pilotesFiltres = pilotes.filter(p => 
    p.identifiant.toLowerCase().includes(searchPilote.toLowerCase())
  ).slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titre || !description) {
      setError('Titre et description requis');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/ifsa/signalements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type_signalement: typeSignalement,
          titre,
          description,
          pilote_signale_id: piloteSignaleId || null,
          compagnie_signalee_id: compagnieSignaleeId || null,
          preuves: preuves || null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');

      setSuccess(`Signalement ${data.signalement.numero_signalement} créé avec succès !`);
      setTitre('');
      setDescription('');
      setPiloteSignaleId('');
      setCompagnieSignaleeId('');
      setPreuves('');
      setSearchPilote('');
      router.refresh();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('nouveau')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'nouveau'
              ? 'bg-orange-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Send className="h-4 w-4 inline mr-2" />
          Nouveau signalement
        </button>
        <button
          onClick={() => setActiveTab('mes')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'mes'
              ? 'bg-orange-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <FileText className="h-4 w-4 inline mr-2" />
          Mes signalements
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-300">
          <X className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-3 text-emerald-300">
          <Check className="h-5 w-5 flex-shrink-0" />
          <p>{success}</p>
          <button onClick={() => setSuccess('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {activeTab === 'nouveau' && (
        <form onSubmit={handleSubmit} className="card space-y-6">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
            Créer un signalement
          </h2>

          {/* Type */}
          <div>
            <label className="label">Type de signalement</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPES_SIGNALEMENT.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setTypeSignalement(type.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    typeSignalement === type.value
                      ? 'border-orange-500 bg-orange-500/20'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <p className="font-medium text-slate-200">{type.label}</p>
                  <p className="text-xs text-slate-400">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Titre */}
          <div>
            <label className="label">Titre du signalement *</label>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="Résumé bref du signalement"
              className="input w-full"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="label">Description détaillée *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez les faits en détail : date, heure, lieu, circonstances..."
              rows={5}
              className="input w-full resize-none"
              required
            />
          </div>

          {/* Personne/Compagnie signalée */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Pilote concerné (optionnel)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchPilote}
                  onChange={(e) => {
                    setSearchPilote(e.target.value);
                    setPiloteSignaleId('');
                  }}
                  placeholder="Rechercher un pilote..."
                  className="input w-full pl-10"
                />
              </div>
              {searchPilote && pilotesFiltres.length > 0 && !piloteSignaleId && (
                <div className="mt-1 bg-slate-800 rounded-lg border border-slate-700 max-h-32 overflow-y-auto">
                  {pilotesFiltres.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPiloteSignaleId(p.id);
                        setSearchPilote(p.identifiant);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700"
                    >
                      {p.identifiant}
                    </button>
                  ))}
                </div>
              )}
              {piloteSignaleId && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Pilote sélectionné
                </p>
              )}
            </div>

            <div>
              <label className="label">Compagnie concernée (optionnel)</label>
              <select
                value={compagnieSignaleeId}
                onChange={(e) => setCompagnieSignaleeId(e.target.value)}
                className="input w-full"
              >
                <option value="">Aucune compagnie</option>
                {compagnies.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Preuves */}
          <div>
            <label className="label">Preuves (optionnel)</label>
            <textarea
              value={preuves}
              onChange={(e) => setPreuves(e.target.value)}
              placeholder="Liens vers des captures d'écran, vidéos, ou descriptions de preuves..."
              rows={2}
              className="input w-full resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !titre || !description}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer le signalement
          </button>
        </form>
      )}

      {activeTab === 'mes' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Mes signalements</h2>

          {mesSignalements.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Vous n&apos;avez pas encore fait de signalement.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mesSignalements.map((sig) => {
                const statutInfo = STATUTS[sig.statut as keyof typeof STATUTS] || STATUTS.nouveau;
                return (
                  <div key={sig.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-slate-500">{sig.numero_signalement}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${statutInfo.color}`}>
                            {statutInfo.label}
                          </span>
                        </div>
                        <h3 className="font-medium text-slate-200">{sig.titre}</h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {toLocaleDateStringUTC(sig.created_at, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })} UTC
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        {sig.statut === 'classe' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                        {sig.statut === 'rejete' && <XCircle className="h-4 w-4 text-red-400" />}
                      </div>
                    </div>

                    {sig.reponse_ifsa && (
                      <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                        <p className="text-xs text-blue-400 font-medium mb-1">Réponse IFSA :</p>
                        <p className="text-sm text-blue-300">{sig.reponse_ifsa}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
