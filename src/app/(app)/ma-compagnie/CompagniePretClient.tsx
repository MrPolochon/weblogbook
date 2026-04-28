'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Landmark, DollarSign, Percent, Clock, CheckCircle2, AlertTriangle, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

type OptionPret = {
  montant: number;
  tauxInteret: number;
};

type Pret = {
  id: string;
  montant_emprunte: number;
  taux_interet: number;
  montant_total_du: number;
  montant_rembourse: number;
  statut: string;
  created_at: string;
  rembourse_at: string | null;
  echeance_at: string | null;
};

interface Props {
  compagnieId: string;
}

/** Montant saisi par l’utilisateur (F$ entiers) : accepte espaces, F$, séparateurs . , */
function parseMontantSaisiePret(raw: string): number | null {
  const cleaned = raw
    .trim()
    .replace(/[Ff]\$/g, '')
    .replace(/\$/g, '')
    .replace(/[\s\u00A0\u202F]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Montants API parfois sérialisés en string : toujours ramener à un entier F$ cohérent. */
function restePretF$(totalDu: unknown, dejaRembourse: unknown): number {
  const t = Number(totalDu);
  const r = Number(dejaRembourse);
  if (!Number.isFinite(t) || !Number.isFinite(r)) return 0;
  return Math.max(0, Math.round(t - r));
}

export default function CompagniePretClient({ compagnieId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pretActif, setPretActif] = useState<Pret | null>(null);
  const [historique, setHistorique] = useState<Pret[]>([]);
  const [optionsPrets, setOptionsPrets] = useState<OptionPret[]>([]);
  const [tauxPrelevement, setTauxPrelevement] = useState(30);
  const [selectedMontant, setSelectedMontant] = useState<number | null>(null);
  const [demandingPret, setDemandingPret] = useState(false);
  const [montantRemboursement, setMontantRemboursement] = useState('');
  const [remboursementEnCours, setRemboursementEnCours] = useState(false);

  const loadPret = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(`/api/compagnies/${compagnieId}/pret`);
      const data = await res.json();
      if (res.ok) {
        const raw = data.pretActif;
        setPretActif(raw && typeof raw === 'object' ? (raw as Pret) : null);
        setHistorique(Array.isArray(data.historique) ? data.historique : []);
        setOptionsPrets(Array.isArray(data.optionsPrets) ? data.optionsPrets : []);
        setTauxPrelevement(typeof data.tauxPrelevement === 'number' ? data.tauxPrelevement : 30);
      } else {
        setError(data.error || 'Erreur');
      }
    } catch {
      setError('Erreur de chargement');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [compagnieId]);

  useEffect(() => {
    loadPret();
  }, [loadPret]);

  async function handleDemanderPret() {
    if (!selectedMontant) return;
    
    const option = optionsPrets.find(o => o.montant === selectedMontant);
    if (!option) return;

    const interets = Math.round(selectedMontant * option.tauxInteret / 100);
    const total = selectedMontant + interets;
    
    if (!confirm(`Demander un prêt de ${selectedMontant.toLocaleString('fr-FR')} F$ ?\n\n• Taux d'intérêt: ${option.tauxInteret}%\n• Intérêts: ${interets.toLocaleString('fr-FR')} F$\n• Total à rembourser: ${total.toLocaleString('fr-FR')} F$\n• Prélèvement: ${tauxPrelevement}% des revenus de chaque vol\n\nLe montant sera crédité immédiatement sur le compte de la compagnie.`)) {
      return;
    }

    setDemandingPret(true);
    setError(null);

    try {
      const res = await fetch(`/api/compagnies/${compagnieId}/pret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant: selectedMontant }),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Erreur');
      
      toast.success(data.message);
      setSelectedMontant(null);
      loadPret();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setDemandingPret(false);
    }
  }

  async function executeRemboursementPret(montant: number) {
    if (!Number.isFinite(montant) || montant <= 0) {
      setError('Montant invalide (entier positif requis).');
      return;
    }

    if (pretActif) {
      const reste = restePretF$(pretActif.montant_total_du, pretActif.montant_rembourse);
      if (!Number.isFinite(reste) || reste <= 0) {
        setError('Ce prêt est déjà entièrement remboursé. Actualisez la page si ce message est inattendu.');
        return;
      }
      if (montant > reste) {
        setError(`Montant trop élevé. Maximum autorisé: ${reste.toLocaleString('fr-FR')} F$.`);
        return;
      }
    }

    if (!confirm(`Rembourser ${montant.toLocaleString('fr-FR')} F$ sur le prêt ?\n\nCe montant sera débité du compte de la compagnie.`)) {
      return;
    }

    setRemboursementEnCours(true);
    setError(null);

    try {
      const res = await fetch(`/api/compagnies/${compagnieId}/pret`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ montant }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erreur');

      toast.success(data.message);
      setMontantRemboursement('');
      loadPret({ silent: true });
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      setError(msg);
      toast.error(msg);
    } finally {
      setRemboursementEnCours(false);
    }
  }

  async function handleRembourserPret() {
    const parsed = parseMontantSaisiePret(montantRemboursement);
    await executeRemboursementPret(parsed ?? NaN);
  }

  /** Toujours calculer le reliquat depuis le prêt affiché (ne pas passer par un argument optionnel ambigu). */
  async function handleRembourserToutLeReste() {
    if (!pretActif) return;
    const montant = restePretF$(pretActif.montant_total_du, pretActif.montant_rembourse);
    await executeRemboursementPret(montant);
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-slate-400">Chargement...</p>
      </div>
    );
  }

  const resteARembourser = pretActif ? restePretF$(pretActif.montant_total_du, pretActif.montant_rembourse) : 0;
  const resteRemboursable = Number.isFinite(resteARembourser) && resteARembourser > 0;
  const totalDuNum = pretActif ? Number(pretActif.montant_total_du) : 0;
  const rembourseNum = pretActif ? Number(pretActif.montant_rembourse) : 0;
  const progressPct =
    pretActif && Number.isFinite(totalDuNum) && totalDuNum > 0 && Number.isFinite(rembourseNum)
      ? Math.round((rembourseNum / totalDuNum) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Prêt actif */}
      {pretActif ? (
        <div className="card border-amber-500/30 bg-amber-500/5">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-amber-200 flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Prêt en cours
            </h3>
            <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              Actif
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Montant emprunté</p>
              <p className="text-lg font-bold text-slate-200">
                {pretActif.montant_emprunte.toLocaleString('fr-FR')} F$
              </p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Taux d&apos;intérêt</p>
              <p className="text-lg font-bold text-amber-400">
                {pretActif.taux_interet}%
              </p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Total à rembourser</p>
              <p className="text-lg font-bold text-slate-200">
                {pretActif.montant_total_du.toLocaleString('fr-FR')} F$
              </p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Reste à payer</p>
              <p className="text-lg font-bold text-red-400">
                {resteARembourser.toLocaleString('fr-FR')} F$
              </p>
            </div>
          </div>

          {/* Barre de progression */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Progression du remboursement</span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {pretActif.montant_rembourse.toLocaleString('fr-FR')} F$ remboursés sur {pretActif.montant_total_du.toLocaleString('fr-FR')} F$
            </p>
          </div>

          {/* Echeance */}
          {(() => {
            if (!pretActif.echeance_at) {
              return (
                <div className="mt-4 p-3 bg-slate-800/30 rounded-lg flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
                  <p className="text-sm text-slate-400">Date limite de remboursement : <span className="text-slate-300 font-semibold">non definie</span></p>
                </div>
              );
            }
            const echeance = new Date(pretActif.echeance_at);
            const now = new Date();
            const msRestants = echeance.getTime() - now.getTime();
            const joursRestants = Math.max(0, Math.ceil(msRestants / 86_400_000));
            const isDepasse = msRestants < 0;
            const isUrgent = !isDepasse && joursRestants <= 3;
            return (
              <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
                isDepasse ? 'bg-red-500/15 border border-red-500/40' :
                isUrgent ? 'bg-orange-500/15 border border-orange-500/30' :
                'bg-slate-800/30'
              }`}>
                <Clock className={`h-4 w-4 mt-0.5 shrink-0 ${isDepasse ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-slate-400'}`} />
                <div>
                  <p className={`text-sm font-semibold ${isDepasse ? 'text-red-300' : isUrgent ? 'text-orange-300' : 'text-slate-300'}`}>
                    {isDepasse
                      ? 'Echeance depassee — remboursement force imminent'
                      : `Date limite : ${echeance.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                    }
                  </p>
                  <p className={`text-xs mt-0.5 ${isDepasse ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-slate-500'}`}>
                    {isDepasse
                      ? 'Le solde du compte sera debite du montant restant. En cas de decouvert, vos actifs pourront etre vendus automatiquement.'
                      : joursRestants <= 1
                      ? 'Dernier jour pour rembourser !'
                      : `${joursRestants} jours restants`
                    }
                  </p>
                </div>
              </div>
            );
          })()}

          <div className="mt-4 p-3 bg-slate-800/30 rounded-lg flex items-start gap-2">
            <TrendingDown className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-400">
              <strong className="text-amber-400">{tauxPrelevement}%</strong> des revenus bruts de chaque vol commercial sont automatiquement prélevés pour rembourser le prêt.
            </p>
          </div>

          {/* Remboursement manuel */}
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <h4 className="text-sm font-semibold text-emerald-200 mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Remboursement anticipé
            </h4>
            <p className="text-xs text-slate-400 mb-3">
              Vous pouvez contribuer au remboursement du prêt à tout moment depuis le compte de la compagnie.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={resteRemboursable ? resteARembourser : undefined}
                value={montantRemboursement}
                onChange={(e) => setMontantRemboursement(e.target.value)}
                placeholder={`Max: ${resteARembourser.toLocaleString('fr-FR')} F$`}
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleRembourserPret()}
                disabled={remboursementEnCours || !montantRemboursement}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm whitespace-nowrap"
              >
                {remboursementEnCours ? 'En cours...' : 'Rembourser'}
              </button>
              <button
                type="button"
                onClick={handleRembourserToutLeReste}
                disabled={remboursementEnCours || !resteRemboursable}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm whitespace-nowrap"
              >
                Rembourser le reste
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Demander un prêt */
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-4">
            <Landmark className="h-5 w-5 text-sky-400" />
            Demander un prêt bancaire
          </h3>

          <p className="text-sm text-slate-400 mb-4">
            Sélectionnez le montant souhaité. Le prêt sera remboursé automatiquement par prélèvement de {tauxPrelevement}% sur les revenus de chaque vol commercial.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            {optionsPrets.map((option) => {
              const interets = Math.round(option.montant * option.tauxInteret / 100);
              const total = option.montant + interets;
              const isSelected = selectedMontant === option.montant;
              
              return (
                <button
                  key={option.montant}
                  type="button"
                  onClick={() => setSelectedMontant(isSelected ? null : option.montant)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    isSelected 
                      ? 'border-sky-500 bg-sky-500/10' 
                      : 'border-slate-700 hover:border-slate-600 bg-slate-800/30'
                  }`}
                >
                  <p className="text-xl font-bold text-slate-100 mb-1">
                    {option.montant.toLocaleString('fr-FR')} F$
                  </p>
                  <div className="flex items-center gap-1 text-sm mb-2">
                    <Percent className="h-3 w-3 text-amber-400" />
                    <span className={option.tauxInteret >= 10 ? 'text-red-400' : option.tauxInteret >= 5 ? 'text-amber-400' : 'text-emerald-400'}>
                      {option.tauxInteret}% d&apos;intérêts
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    À rembourser: {total.toLocaleString('fr-FR')} F$
                  </p>
                  <p className="text-xs text-slate-600">
                    (dont {interets.toLocaleString('fr-FR')} F$ d&apos;intérêts)
                  </p>
                </button>
              );
            })}
          </div>

          {selectedMontant && (
            <div className="flex items-center justify-between p-4 bg-sky-500/10 border border-sky-500/30 rounded-lg mb-4">
              <div>
                <p className="text-sm text-slate-300">
                  Prêt sélectionné: <strong className="text-sky-400">{selectedMontant.toLocaleString('fr-FR')} F$</strong>
                </p>
                <p className="text-xs text-slate-500">
                  Le montant sera crédité immédiatement sur le compte de la compagnie.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDemanderPret}
                disabled={demandingPret}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-2"
              >
                {demandingPret ? (
                  <>Traitement...</>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    Confirmer
                  </>
                )}
              </button>
            </div>
          )}

          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200">
              <strong>Attention :</strong> Vous ne pouvez avoir qu&apos;un seul prêt actif à la fois. Les taux d&apos;intérêt augmentent avec le montant emprunté. Assurez-vous de pouvoir rembourser !
            </p>
          </div>
        </div>
      )}

      {/* Historique des prêts */}
      {historique.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-slate-400" />
            Historique des prêts remboursés
          </h3>
          
          <div className="space-y-2">
            {historique.map((pret) => (
              <div key={pret.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-sm text-slate-200">
                      {pret.montant_emprunte.toLocaleString('fr-FR')} F$ à {pret.taux_interet}%
                    </p>
                    <p className="text-xs text-slate-500">
                      Remboursé le {new Date(pret.rembourse_at!).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-emerald-400">
                  {pret.montant_total_du.toLocaleString('fr-FR')} F$ payés
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
