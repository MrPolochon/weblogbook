'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plane, Plus, Wrench, AlertTriangle, Edit2, MapPin, Percent, ShoppingCart, Skull, Sparkles, Trash2, Handshake, Gift } from 'lucide-react';
import { COUT_AFFRETER_TECHNICIENS, COUT_VOL_FERRY, TEMPS_MAINTENANCE_MIN, TEMPS_MAINTENANCE_MAX } from '@/lib/compagnie-utils';
import Link from 'next/link';
import { toast } from 'sonner';

type TypeAvion = { id: string; nom: string; constructeur: string };
type Hub = { aeroport_code: string };
type Avion = {
  id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  usure_percent: number;
  aeroport_actuel: string;
  statut: string;
  types_avion: TypeAvion | TypeAvion[] | null;
  maintenance_fin_at: string | null;
  detruit?: boolean;
  detruit_at?: string | null;
  detruit_raison?: string | null;
  location_status?: 'leased_out' | 'leased_in' | null;
  location_id?: string | null;
  location_loueur_compagnie_id?: string | null;
  location_locataire_compagnie_id?: string | null;
  location_prix_journalier?: number | null;
  location_pourcentage_revenu_loueur?: number | null;
};

interface Props {
  compagnieId: string;
  soldeCompagnie?: number;
  isPdg?: boolean;
  allianceId?: string | null;
}

export default function CompagnieAvionsClient({ compagnieId, soldeCompagnie = 0, isPdg = true, allianceId }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [avions, setAvions] = useState<Avion[]>([]);
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [compagnies, setCompagnies] = useState<Array<{ id: string; nom: string }>>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationAvionId, setLocationAvionId] = useState<string | null>(null);
  const [locationCompagnieId, setLocationCompagnieId] = useState('');
  const [locationPrixJour, setLocationPrixJour] = useState('10000');
  const [locationPct, setLocationPct] = useState('20');
  const [locationDuree, setLocationDuree] = useState('3');

  // Transfert alliance (don / vente / prêt)
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAvionId, setTransferAvionId] = useState<string | null>(null);
  const [transferType, setTransferType] = useState<'don' | 'vente' | 'pret'>('don');
  const [transferDestId, setTransferDestId] = useState('');
  const [transferSansDest, setTransferSansDest] = useState(false);
  const [transferPrix, setTransferPrix] = useState('');
  const [transferDuree, setTransferDuree] = useState('7');
  const [allianceMembres, setAllianceMembres] = useState<Array<{ compagnie_id: string; compagnie: { id: string; nom: string } | null }>>([]);
  const [allianceParams, setAllianceParams] = useState<{ don_avions_actif?: boolean; transfert_avions_actif?: boolean; pret_avions_actif?: boolean } | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  // Édition
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editImmat, setEditImmat] = useState('');
  const [editNom, setEditNom] = useState('');

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const loadAvions = useCallback(async () => {
    try {
      const res = await fetch(`/api/compagnies/avions?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setAvions(d || []);
      }
      else setError(d.error || 'Erreur');
    } catch {
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [compagnieId]);

  const loadHubs = useCallback(async () => {
    try {
      const res = await fetch(`/api/compagnies/hubs?compagnie_id=${compagnieId}`);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setHubs(d || []);
    } catch {
      console.error('Erreur chargement hubs');
    }
  }, [compagnieId]);

  useEffect(() => {
    loadAvions();
    loadHubs();
    if (isPdg) {
      fetch('/api/compagnies/list')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setCompagnies(data.filter((c) => c.id !== compagnieId));
          }
        })
        .catch(() => {});
    }
  }, [compagnieId, isPdg, loadAvions, loadHubs]);

  async function handleReparer(avionId: string) {
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/reparer`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
      loadAvions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  async function handleDebloquer(avionId: string) {
    if (!confirm(`Débloquer cet avion pour un vol ferry ? L'avion pourra faire un vol à vide vers un hub (coût ${COUT_VOL_FERRY.toLocaleString('fr-FR')} F$).`)) return;
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/debloquer`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      startTransition(() => router.refresh());
      loadAvions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  async function handleAffreterTechniciens(avionId: string, forceCheck = false) {
    // Si c'est une vérification forcée (pour compléter maintenance), pas de confirmation
    if (!forceCheck && !confirm(`Affréter des techniciens pour réparer cet avion sur place ? Coût : ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$. Délai : ${TEMPS_MAINTENANCE_MIN} à ${TEMPS_MAINTENANCE_MAX} min.`)) return;
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/affreter-techniciens`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.temps_restant_min !== undefined) {
          toast.info(`Techniciens en cours de travail. Temps restant : ${d.temps_restant_min} min.`);
        } else {
          throw new Error(d.error || 'Erreur');
        }
        return;
      }
      if (d.repare) {
        toast.success('Avion réparé avec succès ! L\'avion est maintenant opérationnel.');
      } else {
        toast.info(d.message || `Techniciens affrétés. L'avion sera réparé dans ${d.temps_attente_min || 60} minutes.`);
      }
      startTransition(() => router.refresh());
      loadAvions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  // Vérifier la maintenance terminée
  async function handleVerifierMaintenance(avionId: string) {
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/affreter-techniciens`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (d.repare) {
        toast.success('Avion réparé avec succès ! L\'avion est maintenant opérationnel.');
        startTransition(() => router.refresh());
        loadAvions();
      } else if (d.temps_restant_min !== undefined) {
        toast.info(`Maintenance en cours. Temps restant : ${d.temps_restant_min} min.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  // Tenter de réparer un avion détruit (0.5% de chance, coûte 1M F$)
  async function handleTenterReparation(avionId: string, immat: string) {
    if (!confirm(`⚠️ ATTENTION !\n\nTenter de réparer l'avion détruit ${immat} ?\n\n• Coût : 1 000 000 F$\n• Probabilité de succès : 0.5%\n\nC'est un pari très risqué !`)) return;
    
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/tenter-reparation`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      
      toast.info(d.message);
      startTransition(() => router.refresh());
      loadAvions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  // Vendre les pièces détachées d'un avion détruit (5K-15K F$)
  async function handleVendrePieces(avionId: string, immat: string) {
    if (!confirm(`Vendre les pièces détachées de l'épave ${immat} ?\n\nVous récupérerez entre 5 000 et 15 000 F$.\n\n⚠️ L'avion sera définitivement supprimé !`)) return;
    
    setActionId(avionId);
    try {
      const res = await fetch(`/api/compagnies/avions/${avionId}/vendre-pieces`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      
      toast.success(d.message);
      startTransition(() => router.refresh());
      loadAvions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  function startEdit(avion: Avion) {
    setEditingId(avion.id);
    setEditImmat(avion.immatriculation);
    setEditNom(avion.nom_bapteme || '');
  }

  async function handleSaveEdit() {
    if (!editingId) return;
    setActionId(editingId);
    try {
      const res = await fetch(`/api/compagnies/avions/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          immatriculation: editImmat.trim().toUpperCase(),
          nom_bapteme: editNom.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setEditingId(null);
      startTransition(() => router.refresh());
      loadAvions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  function openTransferModal(avionId: string) {
    if (!allianceId) return;
    setTransferAvionId(avionId);
    setTransferDestId('');
    setTransferSansDest(false);
    setTransferPrix('');
    setTransferDuree('7');
    setShowTransferModal(true);
    setAllianceMembres([]);
    setAllianceParams(null);
    fetch(`/api/alliances/${allianceId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.membres) setAllianceMembres(d.membres.filter((m: { compagnie_id: string }) => m.compagnie_id !== compagnieId));
        if (d.parametres) {
          setAllianceParams(d.parametres);
          const p = d.parametres;
          if (p.don_avions_actif) setTransferType('don');
          else if (p.transfert_avions_actif) setTransferType('vente');
          else if (p.pret_avions_actif) setTransferType('pret');
        }
      })
      .catch(() => {});
  }

  async function handleTransferAlliance() {
    if (!allianceId || !transferAvionId) return;
    const destRequired = transferType === 'pret' || (transferType === 'don' && !transferSansDest);
    if (destRequired && !transferDestId) return;
    const typesDisponibles: Array<'don' | 'vente' | 'pret'> = [];
    if (allianceParams?.don_avions_actif) typesDisponibles.push('don');
    if (allianceParams?.transfert_avions_actif) typesDisponibles.push('vente');
    if (allianceParams?.pret_avions_actif) typesDisponibles.push('pret');
    if (!typesDisponibles.includes(transferType)) {
      toast.error('Ce type de transfert n\'est pas activé dans l\'alliance.');
      return;
    }
    if (transferType === 'vente' && (!transferPrix || parseInt(transferPrix, 10) < 0)) {
      toast.error('Indiquez un prix pour la vente.');
      return;
    }
    setTransferLoading(true);
    try {
      const body: Record<string, unknown> = {
        type_transfert: transferType,
        compagnie_avion_id: transferAvionId,
        compagnie_dest_id: (transferType === 'vente' || (transferType === 'don' && transferSansDest)) ? null : transferDestId,
      };
      if (transferType === 'vente') body.prix = parseInt(transferPrix, 10) || 0;
      if (transferType === 'pret') body.duree_jours = parseInt(transferDuree, 10) || 7;
      const res = await fetch(`/api/alliances/${allianceId}/transferts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      toast.success('Proposition envoyée. Consultez Alliance > Flotte pour accepter ou récupérer.');
      setShowTransferModal(false);
      setTransferAvionId(null);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setTransferLoading(false);
    }
  }

  async function handleCreateLocation() {
    if (!locationAvionId || !locationCompagnieId) return;
    setActionId(locationAvionId);
    try {
      const res = await fetch('/api/compagnies/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avion_id: locationAvionId,
          locataire_compagnie_id: locationCompagnieId,
          prix_journalier: parseInt(locationPrixJour, 10),
          pourcentage_revenu_loueur: parseInt(locationPct, 10),
          duree_jours: parseInt(locationDuree, 10)
        })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Erreur');
      setShowLocationModal(false);
      setLocationAvionId(null);
      setLocationCompagnieId('');
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  }

  function getStatutLabel(statut: string, maintenanceFinAt?: string | null, usure?: number, detruit?: boolean) {
    // Avion détruit
    if (detruit) {
      return { text: '💥 DÉTRUIT', className: 'text-red-500 font-bold' };
    }
    
    if (statut === 'maintenance' && maintenanceFinAt) {
      const fin = new Date(maintenanceFinAt);
      const maintenant = new Date();
      const tempsRestantMs = fin.getTime() - maintenant.getTime();
      if (tempsRestantMs > 0) {
        const tempsRestantMin = Math.ceil(tempsRestantMs / 60000);
        return { text: `Maintenance (${tempsRestantMin} min)`, className: 'text-amber-400' };
      }
      return { text: 'Prêt', className: 'text-emerald-400 animate-pulse' };
    }
    // Avion au sol mais à 0% d'usure = devrait être bloqué
    if (statut === 'ground' && usure === 0) {
      return { text: 'À réparer', className: 'text-red-400' };
    }
    switch (statut) {
      case 'ground': return { text: 'Au sol', className: 'text-emerald-400' };
      case 'in_flight': return { text: 'En vol', className: 'text-sky-400' };
      case 'maintenance': return { text: 'Maintenance', className: 'text-amber-400' };
      case 'bloque': return { text: 'Bloqué', className: 'text-red-500' };
      default: return { text: statut, className: 'text-slate-400' };
    }
  }

  function getUsureColor(usure: number) {
    if (usure >= 70) return 'text-emerald-400';
    if (usure >= 30) return 'text-amber-400';
    return 'text-red-400';
  }

  const avionsBloques = avions.filter(a => a.statut === 'bloque' && a.usure_percent === 0 && a.location_status !== 'leased_out');
  const avionsEnVol = avions.filter(a => a.statut === 'in_flight').length;
  const avionsDisponibles = avions.filter(a => a.statut === 'ground' && a.usure_percent > 0 && a.location_status !== 'leased_out').length;
  const hasLeasedIn = avions.some((a) => a.location_status === 'leased_in');

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <Plane className="h-5 w-5 text-sky-400" />
          Flotte ({avions.length} avion{avions.length > 1 ? 's' : ''})
        </h2>
        <div className="flex items-center gap-4">
          {isPdg && (
            <>
              <div className="text-right text-sm">
                <span className="text-emerald-400">{avionsDisponibles}</span>
                <span className="text-slate-500"> dispo</span>
                {avionsEnVol > 0 && (
                  <>
                    <span className="text-slate-600 mx-1">•</span>
                    <span className="text-sky-400">{avionsEnVol}</span>
                    <span className="text-slate-500"> en vol</span>
                  </>
                )}
              </div>
              <Link
                href="/marketplace"
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <ShoppingCart className="h-4 w-4" />
                Acheter
              </Link>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {avionsBloques.length > 0 && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
            <AlertTriangle className="h-4 w-4" />
            {avionsBloques.length} avion(s) bloqué(s) à 0% d&apos;usure
          </div>
          <p className="text-sm text-slate-400">
            Affrétez des techniciens ({COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$) ou débloquez pour un vol ferry ({COUT_VOL_FERRY.toLocaleString('fr-FR')} F$).
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-slate-400">Chargement...</p>
      ) : avions.length === 0 ? (
        <div className="text-center py-6">
          <Plane className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Aucun avion dans la flotte.</p>
          {isPdg && (
            <p className="text-sm text-slate-500 mt-2">
              Achetez des avions sur le <Link href="/marketplace" className="text-purple-400 hover:text-purple-300 underline">Marketplace</Link>.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-400">
                <th className="pb-2 pr-4">Immatriculation</th>
                <th className="pb-2 pr-4">Nom</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">
                  <span className="flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    Usure
                  </span>
                </th>
                <th className="pb-2 pr-4">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Position
                  </span>
                </th>
                <th className="pb-2 pr-4">Statut</th>
                {(isPdg || hasLeasedIn) && <th className="pb-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {avions.map((a) => {
                const statut = getStatutLabel(a.statut, a.maintenance_fin_at, a.usure_percent, a.detruit);
                const isAtHub = hubs.some((h) => h.aeroport_code === a.aeroport_actuel);
                const typeNom = Array.isArray(a.types_avion) ? a.types_avion[0]?.nom : a.types_avion?.nom;
                const isEditing = editingId === a.id;
                const maintenancePrete = a.statut === 'maintenance' && a.maintenance_fin_at && new Date(a.maintenance_fin_at) <= new Date();
                const isLeasedOut = a.location_status === 'leased_out';
                const isLeasedIn = a.location_status === 'leased_in';
                const rowClass = a.detruit
                  ? 'bg-red-950/20 opacity-70'
                  : isLeasedOut
                    ? 'bg-slate-900/40 opacity-60'
                    : isLeasedIn
                      ? 'bg-pink-500/10'
                      : '';
                const canRepairHub = a.statut === 'ground' && a.usure_percent < 100 && isAtHub && !isLeasedOut;
                const canAffreter = (a.statut === 'bloque' || (a.statut === 'ground' && a.usure_percent === 0)) && !isLeasedOut;
                const canDebloquer = (a.statut === 'bloque' || (a.statut === 'ground' && a.usure_percent === 0)) && !isLeasedOut;
                const canVerifierMaintenance = maintenancePrete && !isLeasedOut;
                const noLeasedActions = isLeasedIn && !canRepairHub && !canAffreter && !canDebloquer && !canVerifierMaintenance;
                const leasedReasons: string[] = [];
                if (isLeasedIn && !isAtHub) leasedReasons.push('pas au hub');
                if (isLeasedIn && a.usure_percent > 0 && a.usure_percent < 100) leasedReasons.push('usure > 0%');
                if (isLeasedIn && a.usure_percent === 100) leasedReasons.push('usure 100%');
                if (isLeasedIn && a.statut === 'maintenance' && !maintenancePrete) leasedReasons.push('maintenance en cours');

                return (
                  <tr key={a.id} className={`border-b border-slate-700/50 last:border-0 ${rowClass}`}>
                    <td className="py-2.5 pr-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editImmat}
                          onChange={(e) => setEditImmat(e.target.value.toUpperCase())}
                          className="input py-1 px-2 w-24 text-sm font-mono"
                          maxLength={10}
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          {a.detruit && <Skull className="h-3 w-3 text-red-500" />}
                          <span className={`font-mono font-medium ${a.detruit ? 'text-red-400 line-through' : 'text-slate-200'}`}>
                            {a.immatriculation}
                          </span>
                          {isLeasedOut && <span className="text-xs text-slate-400 ml-2">Loué</span>}
                          {isLeasedIn && <span className="text-xs text-pink-400 ml-2">Loué</span>}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNom}
                          onChange={(e) => setEditNom(e.target.value)}
                          className="input py-1 px-2 w-32 text-sm"
                          placeholder="Nom de baptême"
                          maxLength={50}
                        />
                      ) : (
                        <span className="text-slate-400 italic">{a.nom_bapteme || '—'}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{typeNom || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={getUsureColor(a.usure_percent)}>{a.usure_percent}%</span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">
                      {a.aeroport_actuel}
                      {isAtHub && <span className="text-emerald-400 text-xs ml-1">(Hub)</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={statut.className}>{statut.text}</span>
                      {a.detruit && (
                        <span className="block text-xs text-red-400/80 mt-0.5">
                          {a.detruit_raison || 'Crash'}
                          {a.detruit_at && (
                            <span className="text-red-400/50 ml-1">
                              — {new Date(a.detruit_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </span>
                      )}
                      {isLeasedOut && <span className="block text-xs text-slate-400">En location</span>}
                      {isLeasedIn && <span className="block text-xs text-pink-400">Loué par la compagnie</span>}
                    </td>
                    {(isPdg || isLeasedIn) && (
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={actionId === a.id}
                                className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                              >
                                Sauver
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="text-xs text-slate-400 hover:underline"
                              >
                                Annuler
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Avion détruit - options limitées */}
                              {a.detruit ? (
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-xs text-red-400 italic" title={a.detruit_raison || 'Crash'}>
                                    <Skull className="inline h-3 w-3 mr-1" />
                                    {a.detruit_raison || 'Détruit'}
                                  </span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleTenterReparation(a.id, a.immatriculation)}
                                      disabled={actionId === a.id}
                                      className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 flex items-center gap-1"
                                      title="0.5% de chance - Coût: 1 000 000 F$"
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      Tenter réparation
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleVendrePieces(a.id, a.immatriculation)}
                                      disabled={actionId === a.id}
                                      className="text-xs text-slate-400 hover:text-slate-300 disabled:opacity-50 flex items-center gap-1"
                                      title="Récupère 5 000 - 15 000 F$"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Vendre pièces
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                              {a.statut === 'ground' && !isLeasedOut && !isLeasedIn && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(a)}
                                  className="text-xs text-slate-400 hover:text-slate-200"
                                  title="Modifier"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {a.statut === 'ground' && !a.detruit && !isLeasedOut && !isLeasedIn && (
                                <>
                                  {allianceId && (
                                    <button
                                      type="button"
                                      onClick={() => openTransferModal(a.id)}
                                      className="text-xs text-emerald-400 hover:underline"
                                      title="Donner / transférer à un membre de l'alliance"
                                    >
                                      <Gift className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLocationAvionId(a.id);
                                      setShowLocationModal(true);
                                    }}
                                    className="text-xs text-sky-400 hover:underline"
                                    title="Mettre en location"
                                  >
                                    <Handshake className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                              {isLeasedOut && (
                                <span className="text-xs text-slate-400">Géré par locataire</span>
                              )}
                              {isLeasedIn && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {canAffreter && (
                                    <button
                                      type="button"
                                      onClick={() => handleAffreterTechniciens(a.id)}
                                      disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                      className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                                      title={`Réparer sur place - Coût: ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$ (délai: ${TEMPS_MAINTENANCE_MIN}-${TEMPS_MAINTENANCE_MAX} min)`}
                                    >
                                      <Wrench className="inline h-3 w-3 mr-0.5" />
                                      Affréter
                                    </button>
                                  )}
                                  {canDebloquer && (
                                    <button
                                      type="button"
                                      onClick={() => handleDebloquer(a.id)}
                                      disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                      className="text-xs text-amber-400 hover:underline disabled:opacity-50"
                                      title={`Débloquer pour vol ferry - Coût: ${COUT_VOL_FERRY.toLocaleString('fr-FR')} F$`}
                                    >
                                      Débloquer
                                    </button>
                                  )}
                                  {canRepairHub && (
                                    <button
                                      type="button"
                                      onClick={() => handleReparer(a.id)}
                                      disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                      className="text-xs text-sky-400 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                                      title="Réparer au hub (gratuit)"
                                    >
                                      <Wrench className="h-3 w-3" />
                                      Réparer
                                    </button>
                                  )}
                                  {canVerifierMaintenance && (
                                    <button
                                      type="button"
                                      onClick={() => handleVerifierMaintenance(a.id)}
                                      disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                      className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                                      title="Terminer la maintenance"
                                    >
                                      Récupérer
                                    </button>
                                  )}
                                  {!isPdg && (
                                    <span className="text-xs text-pink-400">Actions PDG locataire</span>
                                  )}
                                  {noLeasedActions && (
                                    <span className="text-xs text-slate-400">
                                      Aucune action disponible{leasedReasons.length > 0 ? ` (${leasedReasons.join(', ')})` : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                              {/* Avion bloqué ou au sol avec 0% d'usure = nécessite réparation */}
                              {(a.statut === 'bloque' || (a.statut === 'ground' && a.usure_percent === 0)) && !isLeasedOut && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleAffreterTechniciens(a.id)}
                                    disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                    className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
                                  title={`Réparer sur place - Coût: ${COUT_AFFRETER_TECHNICIENS.toLocaleString('fr-FR')} F$ (délai: ${TEMPS_MAINTENANCE_MIN}-${TEMPS_MAINTENANCE_MAX} min)`}
                                  >
                                    <Wrench className="inline h-3 w-3 mr-0.5" />
                                    Affréter
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDebloquer(a.id)}
                                    disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                    className="text-xs text-amber-400 hover:underline disabled:opacity-50"
                                    title={`Débloquer pour vol ferry - Coût: ${COUT_VOL_FERRY.toLocaleString('fr-FR')} F$`}
                                  >
                                    Débloquer
                                  </button>
                                </>
                              )}
                              {maintenancePrete && !isLeasedOut && (
                                <button
                                  type="button"
                                  onClick={() => handleVerifierMaintenance(a.id)}
                                  disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                  className="text-xs text-emerald-400 hover:underline disabled:opacity-50 animate-pulse font-semibold"
                                  title="Terminer la maintenance"
                                >
                                  Récupérer
                                </button>
                              )}
                              {a.statut === 'maintenance' && a.maintenance_fin_at && !maintenancePrete && (
                                <span className="text-xs text-slate-500">En réparation...</span>
                              )}
                              {a.statut === 'ground' && a.usure_percent < 100 && isAtHub && !isLeasedOut && (
                                <button
                                  type="button"
                                  onClick={() => handleReparer(a.id)}
                                  disabled={actionId === a.id || (!isPdg && isLeasedIn)}
                                  className="text-xs text-sky-400 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                                  title="Réparer au hub (gratuit)"
                                >
                                  <Wrench className="h-3 w-3" />
                                  Réparer
                                </button>
                              )}
                              {a.statut === 'ground' && a.usure_percent > 0 && !a.detruit && !isLeasedOut && isPdg && (
                                <Link
                                  href={`/reparation?demander=1&avion_id=${a.id}&compagnie_id=${compagnieId}`}
                                  className="text-xs text-orange-400 hover:underline inline-flex items-center gap-1"
                                  title="Envoyer chez une entreprise de réparation"
                                >
                                  <Wrench className="h-3 w-3" />
                                  Réparation pro
                                </Link>
                              )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showTransferModal && allianceId && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Gift className="h-5 w-5 text-emerald-400" />
              Transférer à un membre de l&apos;alliance
            </h3>
            <div className="space-y-3">
              <div>
                <label className="label">Type</label>
                <select className="input w-full" value={transferType} onChange={(e) => setTransferType(e.target.value as 'don' | 'vente' | 'pret')}>
                  {allianceParams?.don_avions_actif && <option value="don">Don (gratuit)</option>}
                  {allianceParams?.transfert_avions_actif && <option value="vente">Vente</option>}
                  {allianceParams?.pret_avions_actif && <option value="pret">Prêt</option>}
                  {allianceParams && !allianceParams.don_avions_actif && !allianceParams.transfert_avions_actif && !allianceParams.pret_avions_actif && (
                    <option value="">Aucun type activé par l&apos;alliance</option>
                  )}
                </select>
                {allianceParams && !allianceParams.don_avions_actif && !allianceParams.transfert_avions_actif && !allianceParams.pret_avions_actif && (
                  <p className="text-xs text-amber-400 mt-1">Le Président ou Vice-Président doit activer les transferts dans Alliance &gt; Paramètres.</p>
                )}
              </div>
              {transferType === 'vente' ? (
                <p className="text-xs text-slate-400">Mise en vente dans l&apos;alliance. Tout membre peut acheter (premier arrivé, premier servi).</p>
              ) : (
                <>
                  {(transferType === 'don') && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={transferSansDest} onChange={(e) => setTransferSansDest(e.target.checked)} className="rounded" />
                      <span className="text-sm text-slate-300">Sans destinataire (tout le monde peut récupérer)</span>
                    </label>
                  )}
                  {!transferSansDest && (
                    <div>
                      <label className="label">Compagnie destinataire</label>
                      <select className="input w-full" value={transferDestId} onChange={(e) => setTransferDestId(e.target.value)}>
                        <option value="">— Choisir —</option>
                        {allianceMembres.map((m) => (
                          <option key={m.compagnie_id} value={m.compagnie_id}>
                            {m.compagnie?.nom || m.compagnie_id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              {transferType === 'vente' && (
                <div>
                  <label className="label">Prix (F$)</label>
                  <input className="input w-full" type="number" min="0" value={transferPrix} onChange={(e) => setTransferPrix(e.target.value)} placeholder="0" />
                </div>
              )}
              {transferType === 'pret' && (
                <div>
                  <label className="label">Durée (jours)</label>
                  <input className="input w-full" type="number" min="1" value={transferDuree} onChange={(e) => setTransferDuree(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                className="btn-primary flex-1"
                onClick={handleTransferAlliance}
                disabled={
                  transferLoading ||
                  ((transferType === 'pret' || (transferType === 'don' && !transferSansDest)) && !transferDestId) ||
                  Boolean(allianceParams && !allianceParams.don_avions_actif && !allianceParams.transfert_avions_actif && !allianceParams.pret_avions_actif)
                }
              >
                {transferLoading ? '…' : 'Envoyer la proposition'}
              </button>
              <button className="btn-secondary" onClick={() => setShowTransferModal(false)} disabled={transferLoading}>Annuler</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLocationModal && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Mettre en location</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Compagnie locataire</label>
                <select className="input w-full" value={locationCompagnieId} onChange={(e) => setLocationCompagnieId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {compagnies.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Prix / jour (F$)</label>
                  <input className="input w-full" type="number" min="0" value={locationPrixJour} onChange={(e) => setLocationPrixJour(e.target.value)} />
                </div>
                <div>
                  <label className="label">% revenu loueur</label>
                  <input className="input w-full" type="number" min="0" max="100" value={locationPct} onChange={(e) => setLocationPct(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Durée (jours)</label>
                <input className="input w-full" type="number" min="1" value={locationDuree} onChange={(e) => setLocationDuree(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn-primary flex-1" onClick={handleCreateLocation} disabled={actionId === locationAvionId}>
                Envoyer la demande
              </button>
              <button className="btn-secondary" onClick={() => setShowLocationModal(false)}>Annuler</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
