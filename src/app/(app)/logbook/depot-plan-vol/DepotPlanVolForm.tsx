'use client';

import { useState, useEffect, useMemo, useTransition, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS, getAeroportInfo, estimerPassagers, estimerCargo, genererTypeCargaison, getCargaisonInfo, TypeCargaison, type CoefficientContext } from '@/lib/aeroports-ptfs';
import { isAvionCompagnieAuSol } from '@/lib/compagnie-utils';
import { joinSidStarRoute, buildRouteWithManual, stripRouteBrackets } from '@/lib/utils';
import { Building2, Plane, Users, Weight, Shield, Radio, Phone, MapPin, Send, Navigation, Sparkles, Gauge, FileText, Route, Briefcase, CheckCircle2 } from 'lucide-react';
import BriaDialog, { getBriaCooldownRemaining } from '@/components/BriaDialog';
import { unlockAudioForIOS } from '@/lib/phone-sounds';
import { toast } from 'sonner';

interface TypeAvion {
  id: string;
  nom: string;
  code_oaci: string | null;
  capacite_pax: number;
  capacite_cargo_kg: number;
  est_militaire?: boolean;
}

interface InventaireItem {
  id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  immatriculation: string | null;
  disponible: boolean;
  types_avion: TypeAvion | null;
}

interface Compagnie {
  id: string;
  nom: string;
  prix_billet_pax: number;
  prix_kg_cargo: number;
  pourcentage_salaire: number;
  code_oaci: string | null;
  role: 'employe' | 'pdg';
}

interface TarifLiaison {
  id: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  prix_billet: number;
  bidirectionnel: boolean;
}

interface AeroportPassagers {
  code_oaci: string;
  passagers_disponibles: number;
  passagers_max: number;
  last_flight_arrival?: string | null;
}

interface AvionIndividuel {
  id: string;
  compagnie_id: string;
  immatriculation: string;
  nom_bapteme: string | null;
  aeroport_actuel: string;
  statut: string;
  usure_percent: number;
  types_avion: { id: string; nom: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number; code_oaci: string | null } | { id: string; nom: string; constructeur: string; capacite_pax: number; capacite_cargo_kg: number; code_oaci: string | null }[] | null;
}

interface Props {
  compagniesDisponibles: Compagnie[];
  inventairePersonnel: InventaireItem[];
  avionsParCompagnie?: Record<string, AvionIndividuel[]>;
}

/** Embeds PostgREST : objet, tableau ou null — évite capacité 0 si tableau vide. */
function premierTypeAvionDepuisEmbed<T extends object>(
  ta: T | T[] | null | undefined
): T | null {
  if (ta == null) return null;
  if (Array.isArray(ta)) return ta[0] ?? null;
  return ta;
}

export default function DepotPlanVolForm({ compagniesDisponibles, inventairePersonnel, avionsParCompagnie = {} }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [aeroport_depart, setAeroportDepart] = useState('');
  const [aeroport_arrivee, setAeroportArrivee] = useState('');
  const [numero_vol, setNumeroVol] = useState('');
  const [porte, setPorte] = useState('');
  const [temps_prev_min, setTempsPrevMin] = useState('');
  const [type_vol, setTypeVol] = useState<'VFR' | 'IFR'>('VFR');
  const [intentions_vol, setIntentionsVol] = useState('');
  const [sid_depart, setSidDepart] = useState('');
  const [star_arrivee, setStarArrivee] = useState('');
  const [route_ifr, setRouteIfr] = useState('');
  const [niveau_croisiere, setNiveauCroisiere] = useState('');
  const [note_atc, setNoteAtc] = useState('');
  
  // Commercial flight options
  const [vol_commercial, setVolCommercial] = useState(false);
  const [vol_ferry, setVolFerry] = useState(false);
  const [selectedCompagnieId, setSelectedCompagnieId] = useState('');
  const [nature_transport, setNatureTransport] = useState<'passagers' | 'cargo'>('passagers');
  const [inventaire_avion_id, setInventaireAvionId] = useState('');
  const [compagnie_avion_id, setCompagnieAvionId] = useState('');
  
  // Calculated values - stockés séparément pour éviter la triche
  const [generatedPax, setGeneratedPax] = useState(0);
  const [generatedCargo, setGeneratedCargo] = useState(0);
  const [estimatedTypeCargaison, setEstimatedTypeCargaison] = useState<TypeCargaison>('general');
  const [lastGeneratedKey, setLastGeneratedKey] = useState('');
  
  // Confirmation vol sans ATC (quand aucun ATC n'est disponible)
  const [showNoAtcConfirm, setShowNoAtcConfirm] = useState(false);
  
  // Tarifs par liaison et saturation
  const [tarifsLiaisons, setTarifsLiaisons] = useState<TarifLiaison[]>([]);
  const [passagersAeroport, setPassagersAeroport] = useState<AeroportPassagers | null>(null);
  const [cargoAeroport, setCargoAeroport] = useState<{ cargo_disponible: number; cargo_max: number } | null>(null);
  // Date du dernier vol arrivé à l'aéroport d'arrivée (pour le bonus d'isolement)
  const [lastArrivalArrivee, setLastArrivalArrivee] = useState<Date | null>(null);
  
  const [loading, setLoading] = useState(false);
  const submitBusyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showBria, setShowBria] = useState(false);

  // SID/STAR depuis la base admin (pour remplir strip_route)
  const [sidList, setSidList] = useState<{ id: string; nom: string; route: string }[]>([]);
  const [starList, setStarList] = useState<{ id: string; nom: string; route: string }[]>([]);
  const [selectedSidRoute, setSelectedSidRoute] = useState<string | null>(null);
  const [selectedStarRoute, setSelectedStarRoute] = useState<string | null>(null);
  const [manualRoutePart, setManualRoutePart] = useState('');
  const [sidCustomMode, setSidCustomMode] = useState(false);
  const [starCustomMode, setStarCustomMode] = useState(false);

  // Get selected company
  const selectedCompagnie = compagniesDisponibles.find(c => c.id === selectedCompagnieId) || null;
  
  // Get individual aircraft for the selected company, filtered by departure airport
  const avionsCompagnie = useMemo(() => 
    selectedCompagnieId ? (avionsParCompagnie[selectedCompagnieId] || []) : [],
    [selectedCompagnieId, avionsParCompagnie]
  );
  // Pour les vols ferry, on peut inclure les avions à 0% d'usure et on n'exige pas qu'ils soient à l'aéroport de départ
  // Car le but du vol ferry est justement de ramener un avion bloqué/à 0% vers un hub
  const avionsDisponibles = useMemo(() => vol_ferry 
    ? avionsCompagnie.filter(a => 
        isAvionCompagnieAuSol(a.statut) // Avion au sol (débloqué)
      )
    : avionsCompagnie.filter(a => 
        isAvionCompagnieAuSol(a.statut) && 
        a.usure_percent > 0 &&
        (!aeroport_depart || a.aeroport_actuel === aeroport_depart.toUpperCase())
      ),
    [vol_ferry, avionsCompagnie, aeroport_depart]
  );
  
  // Get selected aircraft info
  const selectedInventaire = inventairePersonnel.find(i => i.id === inventaire_avion_id);
  const selectedAvionIndiv = avionsCompagnie.find(a => a.id === compagnie_avion_id);
  
  // Auto-select company if only one available
  useEffect(() => {
    if (compagniesDisponibles.length === 1 && !selectedCompagnieId) {
      setSelectedCompagnieId(compagniesDisponibles[0].id);
    }
  }, [compagniesDisponibles, selectedCompagnieId]);

  // Reset aircraft selection when company changes
  useEffect(() => {
    setCompagnieAvionId('');
  }, [selectedCompagnieId]);

  // Reset individual aircraft selection when departure airport changes
  // SAUF si l'avion sélectionné est déjà à cet aéroport
  useEffect(() => {
    if (!aeroport_depart || !compagnie_avion_id) return;
    
    // Trouver l'avion actuellement sélectionné
    const avionSelectionne = avionsCompagnie.find(a => a.id === compagnie_avion_id);
    
    // Ne désélectionner que si l'avion n'est PAS à l'aéroport de départ choisi
    if (avionSelectionne && avionSelectionne.aeroport_actuel !== aeroport_depart.toUpperCase()) {
      setCompagnieAvionId('');
    }
  }, [aeroport_depart, avionsCompagnie, compagnie_avion_id]);

  // Charger les SID quand aéroport de départ change (IFR).
  // AbortController : si l'utilisateur change rapidement d'aéroport, l'ancienne réponse
  // ne doit pas écraser la nouvelle (race condition → SID/STAR de la mauvaise piste).
  useEffect(() => {
    if (!aeroport_depart || type_vol !== 'IFR') {
      setSidList([]);
      setSelectedSidRoute(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/sid-star?aeroport=${encodeURIComponent(aeroport_depart)}&type=SID`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;
        if (Array.isArray(data)) setSidList(data);
        else setSidList([]);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSidList([]);
        toast.error('Impossible de charger les SID. Vérifiez votre connexion.');
      });
    setSidDepart('');
    setSelectedSidRoute(null);
    setManualRoutePart('');
    setSidCustomMode(false);
    return () => ctrl.abort();
  }, [aeroport_depart, type_vol]);

  // Charger les STAR quand aéroport d'arrivée change (IFR) — même protection AbortController.
  useEffect(() => {
    if (!aeroport_arrivee || type_vol !== 'IFR') {
      setStarList([]);
      setSelectedStarRoute(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/sid-star?aeroport=${encodeURIComponent(aeroport_arrivee)}&type=STAR`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;
        if (Array.isArray(data)) setStarList(data);
        else setStarList([]);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setStarList([]);
        toast.error('Impossible de charger les STAR. Vérifiez votre connexion.');
      });
    setStarArrivee('');
    setSelectedStarRoute(null);
    setManualRoutePart('');
    setStarCustomMode(false);
    return () => ctrl.abort();
  }, [aeroport_arrivee, type_vol]);

  // Construire route_ifr : SID et STAR viennent des sélecteurs, la partie manuelle est éditable
  useEffect(() => {
    if (type_vol !== 'IFR') return;
    setRouteIfr(buildRouteWithManual(selectedSidRoute, manualRoutePart, selectedStarRoute));
  }, [type_vol, selectedSidRoute, selectedStarRoute, manualRoutePart]);

  // Charger les tarifs par liaison quand la compagnie change
  useEffect(() => {
    if (!selectedCompagnieId) {
      setTarifsLiaisons([]);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/tarifs-liaisons?compagnie_id=${selectedCompagnieId}`, { signal: ctrl.signal })
      .then(res => res.json())
      .then(data => {
        if (ctrl.signal.aborted) return;
        if (Array.isArray(data)) setTarifsLiaisons(data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        toast.error('Impossible de charger les tarifs de la compagnie.');
      });
    return () => ctrl.abort();
  }, [selectedCompagnieId]);

  // Charger les passagers disponibles quand l'aéroport de départ change
  useEffect(() => {
    if (!aeroport_depart) {
      setPassagersAeroport(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/aeroport-passagers?code_oaci=${aeroport_depart}`, { signal: ctrl.signal })
      .then(res => res.json())
      .then(data => {
        if (ctrl.signal.aborted) return;
        if (data && data.code_oaci) setPassagersAeroport(data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        toast.error('Impossible de récupérer les passagers en attente.');
      });
    return () => ctrl.abort();
  }, [aeroport_depart]);

  // Charger le cargo disponible quand l'aéroport de départ change
  useEffect(() => {
    if (!aeroport_depart) {
      setCargoAeroport(null);
      return;
    }
    
    fetch(`/api/aeroport-cargo?code_oaci=${aeroport_depart}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.cargo_disponible !== undefined) {
          setCargoAeroport({ cargo_disponible: data.cargo_disponible, cargo_max: data.cargo_max || 0 });
        } else {
          // Fallback : utiliser les données statiques
          const aeroportInfo = getAeroportInfo(aeroport_depart);
          if (aeroportInfo) {
            setCargoAeroport({ cargo_disponible: aeroportInfo.cargoMax, cargo_max: aeroportInfo.cargoMax });
          }
        }
      })
      .catch(() => {
        // Fallback en cas d'erreur
        const aeroportInfo = getAeroportInfo(aeroport_depart);
        if (aeroportInfo) {
          setCargoAeroport({ cargo_disponible: aeroportInfo.cargoMax, cargo_max: aeroportInfo.cargoMax });
        }
      });
  }, [aeroport_depart]);

  // Charger le timestamp du dernier vol arrivé à l'aéroport d'arrivée
  // (pour calculer le bonus d'isolement)
  useEffect(() => {
    if (!aeroport_arrivee) {
      setLastArrivalArrivee(null);
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/aeroport-passagers?code_oaci=${aeroport_arrivee}`, { signal: ctrl.signal })
      .then(res => res.json())
      .then(data => {
        if (ctrl.signal.aborted) return;
        if (data && data.last_flight_arrival) {
          setLastArrivalArrivee(new Date(data.last_flight_arrival));
        } else {
          setLastArrivalArrivee(null);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setLastArrivalArrivee(null);
      });
    return () => ctrl.abort();
  }, [aeroport_arrivee]);

  // Trouver le prix du billet pour cette liaison
  const prixBilletLiaison = (() => {
    if (!selectedCompagnie) return 0;
    
    // Chercher un tarif spécifique pour cette liaison
    const tarifSpecifique = tarifsLiaisons.find(
      t => t.aeroport_depart === aeroport_depart && t.aeroport_arrivee === aeroport_arrivee
    );
    
    if (tarifSpecifique) return tarifSpecifique.prix_billet;
    
    // Sinon utiliser le prix par défaut de la compagnie
    return selectedCompagnie.prix_billet_pax;
  })();

  // Generate PAX and CARGO values based on all factors
  // Les vols ferry sont à vide - pas de génération
  useEffect(() => {
    // Doit avoir un avion individuel sélectionné
    // Vol ferry = vol à vide, pas de passagers/cargo
    if (vol_ferry || !vol_commercial || !selectedCompagnie || !compagnie_avion_id || !aeroport_depart || !aeroport_arrivee) {
      setGeneratedPax(0);
      setGeneratedCargo(0);
      setLastGeneratedKey('');
      return;
    }

    // Obtenir le type d'avion depuis l'avion individuel sélectionné
    const avion = premierTypeAvionDepuisEmbed(selectedAvionIndiv?.types_avion);
    if (!avion) {
      setGeneratedPax(0);
      setGeneratedCargo(0);
      setLastGeneratedKey('');
      return;
    }

    const capacitePax = avion.capacite_pax ?? 0;
    const capaciteCargo = avion.capacite_cargo_kg ?? 0;
    const prixCargo = selectedCompagnie.prix_kg_cargo || 0;

    // Clé unique pour régénérer seulement quand les paramètres importants changent
    // (inclut last_flight_arrival pour rafraîchir le bonus d'isolement)
    const aircraftKey = compagnie_avion_id;
    const isoKey = lastArrivalArrivee?.toISOString() ?? 'null';
    const generationKey = `${aircraftKey}-${aeroport_depart}-${aeroport_arrivee}-${prixBilletLiaison}-${prixCargo}-${isoKey}`;
    if (generationKey === lastGeneratedKey) {
      return;
    }

    // Contexte commun : last_flight_arrival pour le bonus d'isolement, ratios pour
    // la saturation, capacités pour le malus petit aéroport.
    const ratioPaxDispo = passagersAeroport && passagersAeroport.passagers_max > 0
      ? passagersAeroport.passagers_disponibles / passagersAeroport.passagers_max
      : undefined;
    const ratioCargoDispo = cargoAeroport && cargoAeroport.cargo_max > 0
      ? cargoAeroport.cargo_disponible / cargoAeroport.cargo_max
      : undefined;
    const ctxBase: CoefficientContext = {
      lastArrivalAtArrivee: lastArrivalArrivee,
      ratioPaxDispo,
      ratioCargoDispo,
      capacitePax,
      capaciteCargoKg: capaciteCargo,
    };

    let pax = 0;
    let cargo = 0;

    // PASSAGERS — estimation déterministe (la variance ±10% s'applique côté serveur)
    if (capacitePax > 0) {
      const paxDispo = passagersAeroport?.passagers_disponibles ?? capacitePax;
      const estim = estimerPassagers(
        aeroport_depart,
        aeroport_arrivee,
        prixBilletLiaison,
        capacitePax,
        paxDispo,
        ctxBase
      );
      pax = estim.passagers;
    }

    // CARGO — estimation déterministe
    if (capaciteCargo > 0 && prixCargo > 0) {
      const cargoDisponible = cargoAeroport?.cargo_disponible ?? getAeroportInfo(aeroport_depart)?.cargoMax ?? 0;
      const estim = estimerCargo(
        aeroport_depart,
        aeroport_arrivee,
        prixCargo,
        capaciteCargo,
        cargoDisponible,
        ctxBase
      );
      cargo = estim.cargo;
    }

    setGeneratedPax(pax);
    setGeneratedCargo(cargo);
    // Type de cargaison provisoire (le serveur tirera le vrai type au dépôt)
    setEstimatedTypeCargaison(genererTypeCargaison());
    setLastGeneratedKey(generationKey);
  }, [vol_commercial, vol_ferry, compagnie_avion_id, selectedCompagnie, selectedAvionIndiv, lastGeneratedKey, aeroport_depart, aeroport_arrivee, prixBilletLiaison, passagersAeroport, cargoAeroport, lastArrivalArrivee]);

  // Revenus : passagers uniquement, cargo uniquement, ou passagers + cargo complémentaire
  const nbPax = nature_transport === 'passagers' ? generatedPax : 0;
  const cargoKg = nature_transport === 'cargo' ? generatedCargo : 0;
  const cargoComplementaire = nature_transport === 'passagers' ? generatedCargo : 0;
  const revenuPax = generatedPax * prixBilletLiaison;
  const prixCargo = selectedCompagnie?.prix_kg_cargo || 0;
  const revenuCargo = (nature_transport === 'cargo' ? generatedCargo : cargoComplementaire) * prixCargo;
  const revenuBrut = nature_transport === 'passagers'
    ? revenuPax + revenuCargo
    : revenuCargo;
  const salairePilote = Math.floor(revenuBrut * (selectedCompagnie?.pourcentage_salaire || 0) / 100);

  // Calculer les capacités et taux de remplissage (avion individuel seulement)
  const avionType = premierTypeAvionDepuisEmbed(selectedAvionIndiv?.types_avion);
  const capacitePaxMax = avionType?.capacite_pax ?? 0;
  const capaciteCargoMax = avionType?.capacite_cargo_kg ?? 0;
  
  const tauxRemplissagePax = capacitePaxMax > 0 ? (nbPax / capacitePaxMax) : 0;
  const tauxRemplissageCargo = capaciteCargoMax > 0 ? (cargoKg / capaciteCargoMax) : 0;
  
  const remplissageMinRequis = 0.25; // 25% minimum
  const remplissageValidePax = tauxRemplissagePax >= remplissageMinRequis;
  const remplissageValideCargo = tauxRemplissageCargo >= remplissageMinRequis;

  // Préparer les données du formulaire
  function getFormData(volSansAtc: boolean = false) {
    const t = parseInt(temps_prev_min, 10);
    return {
      aeroport_depart,
      aeroport_arrivee,
      numero_vol: numero_vol.trim(),
      porte: porte.trim() || undefined,
      temps_prev_min: t,
      type_vol,
      intentions_vol: type_vol === 'VFR' ? intentions_vol.trim() : undefined,
      sid_depart: type_vol === 'IFR' ? sid_depart.trim() : undefined,
      star_arrivee: type_vol === 'IFR' ? star_arrivee.trim() : undefined,
      route_ifr: type_vol === 'IFR' && route_ifr.trim() ? stripRouteBrackets(route_ifr).trim() : undefined,
      niveau_croisiere: type_vol === 'IFR' && niveau_croisiere.trim() ? niveau_croisiere.trim().replace(/^FL\s*/i, '') : undefined,
      strip_route: type_vol === 'IFR' && (sid_depart.trim() || star_arrivee.trim())
        ? (stripRouteBrackets(route_ifr).trim() || (selectedSidRoute && selectedStarRoute ? joinSidStarRoute(selectedSidRoute, selectedStarRoute) : [selectedSidRoute, selectedStarRoute].filter(Boolean).join(' ')) || 'RADAR VECTORS DCT')
        : undefined,
      note_atc: !volSansAtc && note_atc.trim() ? note_atc.trim() : undefined,
      vol_commercial: vol_commercial && !vol_ferry,
      compagnie_id: (vol_commercial || vol_ferry) && selectedCompagnieId ? selectedCompagnieId : undefined,
      nature_transport: vol_commercial && !vol_ferry ? nature_transport : undefined,
      inventaire_avion_id: !vol_commercial && !vol_ferry && inventaire_avion_id ? inventaire_avion_id : undefined,
      compagnie_avion_id: (vol_commercial || vol_ferry) && compagnie_avion_id ? compagnie_avion_id : undefined,
      vol_ferry,
      nb_pax_genere: vol_commercial ? nbPax : undefined,
      cargo_kg_genere: vol_commercial ? (nature_transport === 'cargo' ? cargoKg : (nature_transport === 'passagers' ? cargoComplementaire : 0)) : undefined,
      revenue_brut: vol_commercial ? revenuBrut : undefined,
      salaire_pilote: vol_commercial ? salairePilote : undefined,
      prix_billet_utilise: vol_commercial ? prixBilletLiaison : undefined,
      vol_sans_atc: volSansAtc,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitBusyRef.current) return;
    setError(null);
    setShowNoAtcConfirm(false);
    
    const t = parseInt(temps_prev_min, 10);
    if (!aeroport_depart || !aeroport_arrivee || !numero_vol.trim() || isNaN(t) || t < 1 || !type_vol) {
      setError('Remplissez tous les champs requis.');
      return;
    }
    if (type_vol === 'VFR' && !intentions_vol.trim()) { setError('Intentions de vol requises pour VFR.'); return; }
    if (type_vol === 'IFR' && (!sid_depart.trim() || !star_arrivee.trim())) { setError('SID de départ et STAR d\'arrivée requises pour IFR.'); return; }
    
    // Validation vol commercial
    if (vol_commercial && !selectedCompagnieId) {
      setError('Sélectionnez une compagnie pour un vol commercial.');
      return;
    }
    // Un avion individuel est requis pour les vols commerciaux
    if (vol_commercial && !compagnie_avion_id) {
      setError('Sélectionnez un avion pour un vol commercial.');
      return;
    }
    
    // Vol ferry nécessite un avion individuel et une compagnie
    if (vol_ferry && !compagnie_avion_id) {
      setError('Sélectionnez un avion à déplacer pour le vol ferry.');
      return;
    }
    if (vol_ferry && !selectedCompagnieId) {
      setError('Sélectionnez une compagnie pour le vol ferry.');
      return;
    }
    
    // Validation taux de remplissage minimum (25%) - uniquement pour vols commerciaux
    if (vol_commercial && !vol_ferry && nature_transport === 'passagers' && !remplissageValidePax) {
      setError(`Le vol ne peut pas être effectué : l'avion doit être rempli à au moins 25% de sa capacité. Actuellement : ${nbPax}/${capacitePaxMax} (${Math.round(tauxRemplissagePax * 100)}%)`);
      return;
    }
    if (vol_commercial && !vol_ferry && nature_transport === 'cargo' && !remplissageValideCargo) {
      setError(`Le vol ne peut pas être effectué : l'avion doit être rempli à au moins 25% de sa capacité cargo. Actuellement : ${cargoKg.toLocaleString('fr-FR')}/${capaciteCargoMax.toLocaleString('fr-FR')} kg (${Math.round(tauxRemplissageCargo * 100)}%)`);
      return;
    }
    
    submitBusyRef.current = true;
    setLoading(true);
    try {
      const res = await fetch('/api/plans-vol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormData(false)),
      });
      const data = await res.json().catch(() => ({}));
      
      // Si pas d'ATC disponible, proposer le vol sans ATC
      if (!res.ok && data.error && data.error.includes('Aucune fréquence ATC')) {
        submitBusyRef.current = false;
        setShowNoAtcConfirm(true);
        setLoading(false);
        return;
      }
      
      if (!res.ok) throw new Error(data.error || 'Erreur');
      
      // Rafraîchir les disponibilités passagers et cargo après la création du plan
      if (aeroport_depart) {
        // Rafraîchir les passagers
        fetch(`/api/aeroport-passagers?code_oaci=${aeroport_depart}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.code_oaci) setPassagersAeroport(data);
          })
          .catch(() => {});
        
        // Rafraîchir le cargo
        fetch(`/api/aeroport-cargo?code_oaci=${aeroport_depart}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.cargo_disponible !== undefined) {
              setCargoAeroport({ cargo_disponible: data.cargo_disponible, cargo_max: data.cargo_max || 0 });
            }
          })
          .catch(() => {});
      }
      
      router.push('/logbook/plans-vol');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      submitBusyRef.current = false;
      setLoading(false);
    }
  }

  async function handleSubmitSansAtc() {
    if (submitBusyRef.current) return;
    submitBusyRef.current = true;
    setError(null);
    setShowNoAtcConfirm(false);
    setLoading(true);
    
    try {
      const res = await fetch('/api/plans-vol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getFormData(true)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur');
      
      // Rafraîchir les disponibilités passagers et cargo après la création du plan
      if (aeroport_depart) {
        // Rafraîchir les passagers
        fetch(`/api/aeroport-passagers?code_oaci=${aeroport_depart}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.code_oaci) setPassagersAeroport(data);
          })
          .catch(() => {});
        
        // Rafraîchir le cargo
        fetch(`/api/aeroport-cargo?code_oaci=${aeroport_depart}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.cargo_disponible !== undefined) {
              setCargoAeroport({ cargo_disponible: data.cargo_disponible, cargo_max: data.cargo_max || 0 });
            }
          })
          .catch(() => {});
      }
      
      router.push('/logbook/plans-vol');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      submitBusyRef.current = false;
      setLoading(false);
    }
  }

  const avionsPersonnelsDispo = inventairePersonnel.filter(i => i.disponible);

  // Mode du vol pour l'UI : "personnel", "commercial" ou "ferry"
  const flightMode: 'personnel' | 'commercial' | 'ferry' =
    vol_commercial ? 'commercial' : vol_ferry ? 'ferry' : 'personnel';

  return (
    <>
    {showBria && <BriaDialog onClose={() => setShowBria(false)} />}

    {/* ===== Bouton BRIA — appel téléphone, look cockpit ===== */}
    <div className="max-w-2xl mb-5">
      <button
        type="button"
        onClick={() => {
          unlockAudioForIOS();
          const remaining = getBriaCooldownRemaining();
          if (remaining > 0) {
            const mins = Math.ceil(remaining / 60000);
            toast.error(`Vous ne pouvez pas appeler le BRIA avant ${mins} minute${mins > 1 ? 's' : ''}.`);
            return;
          }
          setShowBria(true);
        }}
        className="group relative w-full overflow-hidden rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-amber-900/40 to-amber-950/60 px-5 py-4 text-amber-50 font-semibold text-lg transition-all duration-300 hover:border-amber-400/70 hover:shadow-[0_10px_38px_rgba(251,191,36,0.25)] active:scale-[0.99]"
      >
        {/* Halo radar derrière l'icône */}
        <span className="pointer-events-none absolute -left-4 top-1/2 -translate-y-1/2 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl group-hover:bg-amber-400/20 transition-colors" />
        {/* Brillance qui balaye au hover */}
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-300/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

        <span className="relative flex items-center justify-center gap-3">
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/50 bg-amber-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
            <Phone className="h-5 w-5 text-amber-300" />
            <span className="absolute inset-0 rounded-full ring-2 ring-amber-400/20 animate-pulse-soft" />
          </span>
          <span className="text-base sm:text-lg font-bold tracking-wide">Appeler le BRIA</span>
          <span className="hidden sm:inline text-xs font-medium text-amber-300/70 ml-1 uppercase tracking-widest">
            · briefing assisté
          </span>
        </span>
      </button>
    </div>

    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {/* ===== Section : Type de mission (carte cockpit) ===== */}
      {compagniesDisponibles.length > 0 && (
        <section className="card-glow stagger-enter">
          <SectionHeader
            icon={<Briefcase className="h-4 w-4" />}
            label="Type de mission"
            subtitle="Choisissez la nature de votre vol"
            accent="sky"
          />

          {/* 3 cartes cliquables : Personnel / Commercial / Ferry */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Personnel */}
            <ModeCard
              active={flightMode === 'personnel'}
              accent="slate"
              icon={<Plane className="h-5 w-5" />}
              title="Personnel"
              subtitle="Avion de votre inventaire"
              onClick={() => { setVolCommercial(false); setVolFerry(false); }}
            />
            {/* Commercial */}
            <ModeCard
              active={flightMode === 'commercial'}
              accent="sky"
              icon={<Building2 className="h-5 w-5" />}
              title="Commercial"
              subtitle="Pax / cargo rémunérés"
              onClick={() => { setVolCommercial(true); setVolFerry(false); }}
            />
            {/* Ferry */}
            <ModeCard
              active={flightMode === 'ferry'}
              accent="amber"
              icon={<Navigation className="h-5 w-5" />}
              title="Ferry (à vide)"
              subtitle="Repositionnement"
              onClick={() => { setVolCommercial(false); setVolFerry(true); }}
            />
          </div>

          {vol_ferry && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 animate-fade-in">
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-200 text-sm">
                Vol à vide pour déplacer un avion. Pas de passagers/cargo. <span className="font-semibold">Coût : 10 000 F$ + taxes aéroportuaires</span>, débité du compte compagnie.
              </p>
            </div>
          )}
          
          {/* Sélection de la compagnie si plusieurs disponibles */}
          {(vol_commercial || vol_ferry) && compagniesDisponibles.length > 1 && (
            <div className="mt-4 animate-fade-in">
              <label className="label flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-sky-400" />
                Pour quelle compagnie ? *
              </label>
              <select 
                className="input w-full" 
                value={selectedCompagnieId} 
                onChange={(e) => setSelectedCompagnieId(e.target.value)}
                required
              >
                <option value="">— Choisir une compagnie —</option>
                {compagniesDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} {c.role === 'pdg' ? '(PDG)' : '(Employé)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Afficher le nom de la compagnie si une seule */}
          {(vol_commercial || vol_ferry) && compagniesDisponibles.length === 1 && selectedCompagnie && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm animate-fade-in">
              <Building2 className="h-3.5 w-3.5 text-sky-400" />
              <span className="text-slate-300">Vol pour</span>
              <span className="font-semibold text-sky-300">{selectedCompagnie.nom}</span>
              {selectedCompagnie.role === 'pdg' && (
                <span className="rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">PDG</span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ===== Section : Sélection de l'appareil ===== */}
      {(vol_commercial || vol_ferry) && selectedCompagnie ? (
        <section className="card-glow stagger-enter">
          <SectionHeader
            icon={<Plane className="h-4 w-4" />}
            label={vol_ferry ? 'Avion à déplacer' : 'Appareil de la flotte'}
            subtitle={vol_ferry ? "L'aéroport de départ sera la position actuelle de l'avion" : `Sélectionner un appareil à ${aeroport_depart?.toUpperCase() || '...'}`}
            accent={vol_ferry ? 'amber' : 'sky'}
            badge={selectedAvionIndiv ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                {selectedAvionIndiv.immatriculation}
              </span>
            ) : null}
          />
          <div className="mt-4 space-y-3">
          {/* Avions individuels avec immatriculation */}
          <div>
              <select 
                className="input w-full" 
                value={compagnie_avion_id} 
                onChange={(e) => {
                  setCompagnieAvionId(e.target.value);
                  // Pour les vols ferry, définir automatiquement l'aéroport de départ
                  if (vol_ferry && e.target.value) {
                    const avionSelect = avionsCompagnie.find(a => a.id === e.target.value);
                    if (avionSelect) {
                      setAeroportDepart(avionSelect.aeroport_actuel);
                    }
                  }
                }}
                required
              >
                <option value="">— Choisir un avion —</option>
                {avionsDisponibles.map((a) => {
                  const typeNom = premierTypeAvionDepuisEmbed(a.types_avion)?.nom;
                  return (
                    <option key={a.id} value={a.id}>
                      {a.immatriculation} {a.nom_bapteme ? `"${a.nom_bapteme}"` : ''} — {typeNom || 'Avion'} — {a.aeroport_actuel} ({a.usure_percent}%)
                      {a.usure_percent === 0 && ' [0% - À RÉPARER]'}
                    </option>
                  );
                })}
              </select>
              {!vol_ferry && aeroport_depart && avionsDisponibles.length === 0 && avionsCompagnie.length > 0 && (
                <p className="text-amber-400 text-sm mt-2">
                  Aucun avion disponible à {aeroport_depart.toUpperCase()}. 
                  {avionsCompagnie.filter(a => isAvionCompagnieAuSol(a.statut) && a.usure_percent > 0).length > 0 && (
                    <span> Avions ailleurs : {avionsCompagnie.filter(a => isAvionCompagnieAuSol(a.statut) && a.usure_percent > 0).map(a => `${a.immatriculation} (${a.aeroport_actuel})`).join(', ')}</span>
                  )}
                </p>
              )}
              {/* Mini-fiche aéronef sélectionné */}
              {selectedAvionIndiv && (() => {
                const t = premierTypeAvionDepuisEmbed(selectedAvionIndiv.types_avion);
                const wear = selectedAvionIndiv.usure_percent;
                const wearColor = wear === 0 ? 'text-rose-300' : wear < 30 ? 'text-amber-300' : wear < 70 ? 'text-sky-300' : 'text-emerald-300';
                const wearBarColor = wear === 0 ? 'bg-rose-500' : wear < 30 ? 'bg-amber-500' : wear < 70 ? 'bg-sky-500' : 'bg-emerald-500';
                return (
                  <div className="mt-3 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 to-slate-900/40 p-3 animate-fade-in">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                          <Plane className="h-4 w-4 text-emerald-300 -rotate-12" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-bold text-emerald-200 tracking-wide">
                            {selectedAvionIndiv.immatriculation}
                            {selectedAvionIndiv.nom_bapteme && <span className="ml-1.5 text-slate-400 font-normal">&laquo;&nbsp;{selectedAvionIndiv.nom_bapteme}&nbsp;&raquo;</span>}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {t?.nom || 'Avion'}
                            {t?.code_oaci && <span className="ml-1.5 font-mono text-slate-500">({t.code_oaci})</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/60 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-sky-300">
                          <MapPin className="h-3 w-3" />
                          {selectedAvionIndiv.aeroport_actuel}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono">
                          <span className={wearColor}>{wear}%</span>
                          <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-700/60">
                            <div className={`h-full ${wearBarColor} transition-all duration-700`} style={{ width: `${wear}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                    {wear === 0 && (
                      <p className="mt-2 text-xs text-rose-300 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        À réparer — 0% d&apos;usure
                      </p>
                    )}
                  </div>
                );
              })()}
              {avionsCompagnie.length === 0 && (
                <p className="text-amber-400 text-sm mt-2">
                  Aucun avion dans la flotte de cette compagnie. Le PDG doit acheter des avions sur le Marketplace.
                </p>
              )}
            </div>
          
          {/* Type de transport - masqué pour vols ferry — segmented control */}
          {!vol_ferry && (
            <div>
              <label className="label">Type de transport</label>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-1">
                <button
                  type="button"
                  onClick={() => setNatureTransport('passagers')}
                  className={`group flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                    nature_transport === 'passagers'
                      ? 'bg-gradient-to-br from-sky-500/30 to-sky-600/20 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(14,165,233,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Users className={`h-4 w-4 ${nature_transport === 'passagers' ? 'text-sky-300' : ''}`} />
                  Passagers
                </button>
                <button
                  type="button"
                  onClick={() => setNatureTransport('cargo')}
                  className={`group flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                    nature_transport === 'cargo'
                      ? 'bg-gradient-to-br from-amber-500/30 to-amber-600/20 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(251,191,36,0.2)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Weight className={`h-4 w-4 ${nature_transport === 'cargo' ? 'text-amber-300' : ''}`} />
                  Cargo
                </button>
              </div>
            </div>
          )}

          {/* Aperçu revenus - masqué pour vols ferry — Style HUD instruments */}
          {!vol_ferry && compagnie_avion_id && aeroport_depart && aeroport_arrivee && (
            <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-slate-950/60 p-4 animate-ticker-pop">
              {/* Halo radar */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-emerald-500/10 blur-3xl" />

              <div className="relative flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15">
                    <Gauge className="h-3.5 w-3.5 text-emerald-300" />
                  </span>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-widest text-emerald-400">Estimation revenus</div>
                    <div className="text-[10px] text-slate-500">Charge utile prévue</div>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-emerald-300">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-hud-blink" />
                  Live
                </span>
              </div>

              {/* Gauge remplissage */}
              <div className="mb-3">
                {nature_transport === 'passagers' ? (
                  <FillGauge
                    label="Passagers"
                    icon={<Users className="h-3.5 w-3.5" />}
                    current={nbPax}
                    max={capacitePaxMax}
                    unit="pax"
                    valid={remplissageValidePax}
                    accent="sky"
                  />
                ) : (
                  <FillGauge
                    label="Cargo"
                    icon={<Weight className="h-3.5 w-3.5" />}
                    current={cargoKg}
                    max={capaciteCargoMax}
                    unit="kg"
                    valid={remplissageValideCargo}
                    accent="amber"
                  />
                )}
              </div>

              {/* Détails revenus */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {nature_transport === 'passagers' ? (
                  <>
                    <p className="text-slate-300 col-span-2 text-xs">
                      <span className="font-mono text-sky-300">{nbPax}</span> passagers
                      <span className="mx-1.5 text-slate-500">@</span>
                      <span className="font-mono text-slate-200">{prixBilletLiaison} F$</span>
                    </p>
                    {cargoComplementaire > 0 && (
                      <p className="text-slate-400 col-span-2 text-xs">
                        + <span className="font-mono text-amber-300">{cargoComplementaire.toLocaleString('fr-FR')} kg</span> cargo complémentaire
                        <span className="mx-1.5 text-slate-500">@</span>
                        <span className="font-mono">{prixCargo} F$/kg</span>
                        <span className="text-amber-300/90 text-[10px] ml-2 inline-flex items-center gap-0.5">
                          <Sparkles className="h-2.5 w-2.5" /> 1% rare +30%
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-slate-300 col-span-2 text-xs">
                      <span className="font-mono text-amber-300">{cargoKg.toLocaleString('fr-FR')} kg</span> cargo
                      <span className="mx-1.5 text-slate-500">@</span>
                      <span className="font-mono text-slate-200">{selectedCompagnie?.prix_kg_cargo || 0} F$/kg</span>
                    </p>
                    {(() => {
                      const cargaisonInfo = getCargaisonInfo(estimatedTypeCargaison);
                      return (
                        <p className={`text-xs col-span-2 ${cargaisonInfo.color}`}>
                          {cargaisonInfo.icon} <span className="font-medium">{cargaisonInfo.nom}</span>
                          {cargaisonInfo.sensibiliteRetard > 1 && (
                            <span className="text-amber-400 ml-2">⚡ Sensible au retard</span>
                          )}
                          {cargaisonInfo.bonusRevenu > 0 && (
                            <span className="text-emerald-400 ml-2">💰 +{cargaisonInfo.bonusRevenu}%</span>
                          )}
                        </p>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Stats finales : revenu brut + salaire */}
              <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-emerald-500/20">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Revenu brut</div>
                  <div className="font-mono text-base font-bold text-slate-100 tabular-nums">{revenuBrut.toLocaleString('fr-FR')} <span className="text-xs text-slate-400">F$</span></div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">Votre salaire ({selectedCompagnie.pourcentage_salaire}%)</div>
                  <div className="font-mono text-base font-bold text-emerald-300 tabular-nums">{salairePilote.toLocaleString('fr-FR')} <span className="text-xs text-emerald-400/70">F$</span></div>
                </div>
              </div>

              {/* Avertissement remplissage insuffisant */}
              {vol_commercial && (
                (nature_transport === 'passagers' && !remplissageValidePax) ||
                (nature_transport === 'cargo' && !remplissageValideCargo)
              ) && (
                <div className="mt-3 p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 flex items-start gap-2 animate-fade-in">
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/40 text-red-100 text-[10px] font-bold mt-0.5">!</span>
                  <p className="text-red-200 text-xs">
                    Remplissage insuffisant : <span className="font-bold">25%</span> minimum requis pour déposer le plan
                  </p>
                </div>
              )}
              {/* Indicateurs de facteurs sous forme de badges */}
              {(() => {
                const aeroportArr = getAeroportInfo(aeroport_arrivee);
                const aeroportDep = getAeroportInfo(aeroport_depart);
                const saturation = passagersAeroport && passagersAeroport.passagers_max > 0
                  ? passagersAeroport.passagers_disponibles / passagersAeroport.passagers_max
                  : 1;
                const badges: React.ReactNode[] = [];
                if (aeroportArr?.tourisme) badges.push(
                  <span key="tour" className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-amber-300">
                    🏖️ Destination touristique +25%
                  </span>
                );
                if (aeroportDep?.taille === 'international') badges.push(
                  <span key="intl" className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-sky-300">
                    ✈️ International
                  </span>
                );
                if (saturation < 0.5) badges.push(
                  <span key="sat" className="inline-flex items-center gap-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-orange-300">
                    ⚠ Saturation {Math.round(saturation * 100)}%
                  </span>
                );
                if (badges.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap gap-1.5">
                    {badges}
                  </div>
                );
              })()}
            </div>
          )}
          </div>
        </section>
      ) : (
        <section className="card-glow stagger-enter">
          <SectionHeader
            icon={<Plane className="h-4 w-4" />}
            label="Mon appareil personnel"
            subtitle="Avion de votre inventaire (vol non rémunéré)"
            accent="slate"
            badge={selectedInventaire ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Sélectionné
              </span>
            ) : null}
          />
          <div className="mt-4">
          {avionsPersonnelsDispo.length > 0 ? (
            <>
              <select 
                className="input w-full" 
                value={inventaire_avion_id} 
                onChange={(e) => setInventaireAvionId(e.target.value)}
              >
                <option value="">— Sélectionner un appareil —</option>
                {avionsPersonnelsDispo.map((inv) => {
                  const estMilitaire = inv.types_avion?.est_militaire || false;
                  return (
                    <option key={inv.id} value={inv.id}>
                      {estMilitaire ? '🛡️ ' : ''}
                      {inv.immatriculation ? `${inv.immatriculation} — ` : ''}
                      {inv.nom_personnalise || inv.types_avion?.nom || 'Avion'}
                      {inv.types_avion?.code_oaci && ` (${inv.types_avion.code_oaci})`}
                      {estMilitaire && ' [MILITAIRE]'}
                    </option>
                  );
                })}
              </select>
              {selectedInventaire?.types_avion?.est_militaire && (
                <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                  <p className="text-xs text-red-300 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Cet avion militaire est utilisable car il est dans votre inventaire personnel.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-400 mt-2">
              <p>Vous n&apos;avez aucun appareil dans votre inventaire.</p>
              <p className="text-amber-400 mt-1">
                Achetez un avion sur le <Link href="/marketplace" className="underline hover:text-amber-300">Marketplace</Link> pour effectuer des vols personnels.
              </p>
            </div>
          )}
          {inventairePersonnel.length > 0 && avionsPersonnelsDispo.length === 0 && (
            <p className="text-amber-400 text-sm mt-2">
              Tous vos appareils sont actuellement en vol.
            </p>
          )}
          </div>
        </section>
      )}

      {/* ===== Section : Route — départ → arrivée avec visuel ===== */}
      <section className="card-glow stagger-enter">
        <SectionHeader
          icon={<Route className="h-4 w-4" />}
          label="Route"
          subtitle="Aéroports de départ et de destination"
          accent="sky"
        />

        {/* Visuel route : DEP — ✈ ··· — ARR */}
        <RouteVisual
          depart={aeroport_depart}
          arrivee={aeroport_arrivee}
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-sky-400" />
              Départ <span className="text-rose-400">*</span>
            </label>
            <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required>
              <option value="">— Choisir —</option>
              {AEROPORTS_PTFS.map((a) => (
                <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-400" />
              Arrivée <span className="text-rose-400">*</span>
            </label>
            <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required>
              <option value="">— Choisir —</option>
              {AEROPORTS_PTFS.map((a) => (
                <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ===== Section : Détails du vol ===== */}
      <section className="card-glow stagger-enter">
        <SectionHeader
          icon={<FileText className="h-4 w-4" />}
          label="Détails du vol"
          subtitle="Numéro, porte et durée prévue"
          accent="indigo"
        />

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Numéro de vol *</label>
            {selectedCompagnie?.code_oaci ? (
              <div className="flex items-stretch">
                <span className="flex items-center px-3 bg-gradient-to-br from-sky-600/40 to-indigo-600/30 text-sky-200 border border-r-0 border-sky-500/40 rounded-l-xl text-sm font-mono font-bold tracking-wider select-none">
                  {selectedCompagnie.code_oaci}
                </span>
                <input
                  type="text"
                  className="input rounded-l-none flex-1 font-mono"
                  value={numero_vol}
                  onChange={(e) => setNumeroVol(e.target.value)}
                  placeholder="2425"
                  required
                />
              </div>
            ) : (
              <input type="text" className="input font-mono" value={numero_vol} onChange={(e) => setNumeroVol(e.target.value)} placeholder="N° de vol" required />
            )}
            {selectedCompagnie?.code_oaci && (
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Ex: 2425 → <span className="font-mono text-sky-400/80">{selectedCompagnie.code_oaci}2425</span> · ou callsign libre (ex: RAIDER)
              </p>
            )}
          </div>
          <div>
            <label className="label">Porte</label>
            <input type="text" className="input font-mono" value={porte} onChange={(e) => setPorte(e.target.value)} placeholder="Optionnel" />
          </div>
        </div>

        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1 max-w-[160px]">
            <label className="label">Temps de vol prévu *</label>
            <div className="relative">
              <input
                type="number"
                className="input w-full pr-12 font-mono"
                value={temps_prev_min}
                onChange={(e) => setTempsPrevMin(e.target.value)}
                min={1}
                required
                placeholder="45"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono uppercase tracking-widest text-slate-500">min</span>
            </div>
          </div>
          {temps_prev_min && parseInt(temps_prev_min, 10) > 0 && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-xs animate-fade-in">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500">ETA</div>
              <div className="font-mono text-sm font-semibold text-sky-300">
                ~{Math.floor(parseInt(temps_prev_min, 10) / 60)}h{(parseInt(temps_prev_min, 10) % 60).toString().padStart(2, '0')}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== Section : Type de vol VFR/IFR ===== */}
      <section className="card-glow stagger-enter">
        <SectionHeader
          icon={<Navigation className="h-4 w-4" />}
          label="Type de vol"
          subtitle={type_vol === 'IFR' ? 'Vol aux instruments — SID/STAR requises' : 'Vol à vue — intentions requises'}
          accent={type_vol === 'IFR' ? 'indigo' : 'emerald'}
          badge={
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest ${
              type_vol === 'IFR'
                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            }`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${type_vol === 'IFR' ? 'bg-indigo-400' : 'bg-emerald-400'} animate-hud-blink`} />
              {type_vol}
            </span>
          }
        />

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-1">
          <button
            type="button"
            onClick={() => setTypeVol('VFR')}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
              type_vol === 'VFR'
                ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(52,211,153,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="font-mono font-bold tracking-wider">VFR</span>
            <span className="text-xs font-normal opacity-80">à vue</span>
          </button>
          <button
            type="button"
            onClick={() => setTypeVol('IFR')}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
              type_vol === 'IFR'
                ? 'bg-gradient-to-br from-indigo-500/30 to-indigo-600/20 text-indigo-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_rgba(129,140,248,0.2)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <span className="font-mono font-bold tracking-wider">IFR</span>
            <span className="text-xs font-normal opacity-80">instruments</span>
          </button>
        </div>

      {type_vol === 'VFR' && (
        <div className="mt-4 animate-fade-in">
          <label className="label">Intentions de vol *</label>
          <textarea className="input min-h-[80px]" value={intentions_vol} onChange={(e) => setIntentionsVol(e.target.value)} required placeholder="Ex: Tour de piste, navigation locale, vols école..." />
        </div>
      )}
      {type_vol === 'IFR' && (
        <div className="mt-4 space-y-3 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
                SID de départ *
              </label>
              {sidList.length > 0 ? (
                <>
                  <select
                    className="input"
                    value={sidCustomMode ? '__custom__' : (sidList.some((s) => s.nom === sid_depart) ? sid_depart : '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') {
                        setSidDepart('');
                        setSelectedSidRoute(null);
                        setSidCustomMode(true);
                      } else if (v) {
                        const proc = sidList.find((s) => s.nom === v);
                        setSidDepart(v);
                        setSelectedSidRoute(proc?.route ?? null);
                        setSidCustomMode(false);
                      } else {
                        setSidDepart('');
                        setSelectedSidRoute(null);
                        setSidCustomMode(false);
                      }
                    }}
                    required={!sidCustomMode}
                  >
                    <option value="">— Choisir —</option>
                    {sidList.map((s) => (
                      <option key={s.id} value={s.nom}>{s.nom}</option>
                    ))}
                    <option value="__custom__">Autre (saisie libre)</option>
                  </select>
                  {sidCustomMode && (
                    <input
                      type="text"
                      className="input mt-2"
                      value={sid_depart}
                      onChange={(e) => { setSidDepart(e.target.value); setSelectedSidRoute(null); }}
                      placeholder="Nom de la SID"
                      required
                    />
                  )}
                </>
              ) : (
                <input type="text" className="input" value={sid_depart} onChange={(e) => { setSidDepart(e.target.value); setSelectedSidRoute(null); }} required />
              )}
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                STAR d&apos;arrivée *
              </label>
              {starList.length > 0 ? (
                <>
                  <select
                    className="input"
                    value={starCustomMode ? '__custom__' : (starList.some((s) => s.nom === star_arrivee) ? star_arrivee : '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '__custom__') {
                        setStarArrivee('');
                        setSelectedStarRoute(null);
                        setStarCustomMode(true);
                      } else if (v) {
                        const proc = starList.find((s) => s.nom === v);
                        setStarArrivee(v);
                        setSelectedStarRoute(proc?.route ?? null);
                        setStarCustomMode(false);
                      } else {
                        setStarArrivee('');
                        setSelectedStarRoute(null);
                        setStarCustomMode(false);
                      }
                    }}
                    required={!starCustomMode}
                  >
                    <option value="">— Choisir —</option>
                    {starList.map((s) => (
                      <option key={s.id} value={s.nom}>{s.nom}</option>
                    ))}
                    <option value="__custom__">Autre (saisie libre)</option>
                  </select>
                  {starCustomMode && (
                    <input
                      type="text"
                      className="input mt-2"
                      value={star_arrivee}
                      onChange={(e) => { setStarArrivee(e.target.value); setSelectedStarRoute(null); }}
                      placeholder="Nom de la STAR"
                      required
                    />
                  )}
                </>
              ) : (
                <input type="text" className="input" value={star_arrivee} onChange={(e) => { setStarArrivee(e.target.value); setSelectedStarRoute(null); }} required />
              )}
            </div>
          </div>
          <div>
            <label className="label">Route IFR (optionnel)</label>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 min-h-[52px] px-4 py-2.5 rounded-xl border border-slate-600/60 bg-slate-800/60 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/30">
              {/* SID : lecture seule, modifiable uniquement via le sélecteur SID */}
              {selectedSidRoute && (
                <>
                  <span className="text-sky-300 font-mono text-sm select-none shrink-0">{selectedSidRoute}</span>
                  <span className="text-slate-500 font-mono text-sm select-none shrink-0">dct</span>
                </>
              )}
              {/* Partie manuelle : seule zone éditable (points entre SID et STAR) */}
              <input
                type="text"
                className="flex-1 min-w-[140px] px-2 py-1 rounded bg-slate-700/50 border border-slate-600/50 text-slate-200 font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 placeholder-slate-500"
                value={manualRoutePart}
                onChange={(e) => setManualRoutePart(e.target.value)}
                placeholder={selectedSidRoute && selectedStarRoute ? "KOLM DCT IYOL (points en route)" : "Points en route..."}
              />
              {/* STAR : lecture seule, modifiable uniquement via le sélecteur STAR */}
              {selectedStarRoute && (
                <>
                  <span className="text-slate-500 font-mono text-sm select-none shrink-0">dct</span>
                  <span className="text-fuchsia-400 font-mono text-sm select-none shrink-0">{selectedStarRoute}</span>
                </>
              )}
              {!selectedSidRoute && !selectedStarRoute && (
                <span className="text-slate-500 text-sm">Sélectionnez une SID et une STAR pour afficher la route.</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              La SID et la STAR sont définies par les sélecteurs ci-dessus. Vous pouvez ajouter des points en route dans la zone centrale (ex. KOLM DCT IYOL).
            </p>
          </div>
          <div>
            <label className="label">Niveau de croisière (optionnel)</label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-slate-500">FL</span>
              <input
                type="text"
                className="input w-28 font-mono"
                value={niveau_croisiere}
                onChange={(e) => setNiveauCroisiere(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="350"
                maxLength={3}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">Sera affiché sur le strip comme <span className="font-mono text-sky-400/80">CRZ&nbsp;: FL{niveau_croisiere || 'XXX'}</span></p>
          </div>
        </div>
      )}
      </section>

      {/* ===== Section : Note ATC ===== */}
      <section className="card-glow stagger-enter">
        <SectionHeader
          icon={<Radio className="h-4 w-4" />}
          label="Note pour l'ATC (optionnel)"
          subtitle="Remarques ou instructions à transmettre au contrôleur"
          accent="indigo"
        />
        <div className="mt-4">
          <textarea
            className="input min-h-[64px]"
            value={note_atc}
            onChange={(e) => setNoteAtc(e.target.value)}
            placeholder="Ex: Premier vol, demande assistance, formation en cours..."
            autoComplete="off"
          />
          <p className="text-xs text-slate-500 mt-1.5">Instructions ou remarques pour le vol uniquement (pas d&apos;email).</p>
        </div>
      </section>

      {/* Confirmation vol sans ATC */}
      {showNoAtcConfirm && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-950/60 via-slate-900/70 to-slate-950/70 p-5 space-y-3 animate-zoom-bounce">
          <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/15 animate-halo-pulse">
              <Radio className="h-5 w-5 text-amber-300" />
            </span>
            <div>
              <p className="font-bold text-amber-100 text-base">Aucun ATC disponible</p>
              <p className="text-sm text-amber-200/80 mt-1">
                Il n&apos;y a actuellement aucune fréquence ATC en ligne à votre aéroport de départ.
              </p>
              <p className="text-sm text-slate-300 mt-2">
                Voulez-vous effectuer ce vol <span className="font-semibold text-amber-200">sans ATC</span> ? Votre plan sera automatiquement accepté et mis en autosurveillance. Vous serez payé normalement à la clôture.
              </p>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleSubmitSansAtc}
              disabled={loading}
              className="btn-warning flex items-center gap-2"
            >
              <Radio className="h-4 w-4" />
              {loading ? 'Envoi…' : 'Oui, voler sans ATC'}
            </button>
            <button
              type="button"
              onClick={() => setShowNoAtcConfirm(false)}
              className="btn-secondary"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 animate-fade-in">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/30 text-red-200 text-xs font-bold">!</span>
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* ===== Bouton submit final — décollage ===== */}
      <SubmitButton
        loading={loading}
        disabled={
          loading ||
          showNoAtcConfirm ||
          (vol_commercial && (
            (nature_transport === 'passagers' && !remplissageValidePax) ||
            (nature_transport === 'cargo' && !remplissageValideCargo)
          ))
        }
      />
    </form>
    </>
  );
}

/* ============================================================
 * Composants UI internes — thème aviation
 * ============================================================ */

type AccentColor = 'sky' | 'amber' | 'emerald' | 'indigo' | 'slate' | 'rose';

const ACCENT_CLASSES: Record<AccentColor, { ring: string; text: string; bg: string; border: string; glow: string }> = {
  sky:     { ring: 'ring-sky-400/40',     text: 'text-sky-300',     bg: 'bg-sky-500/15',     border: 'border-sky-500/40',     glow: 'shadow-[0_0_24px_rgba(56,189,248,0.25)]' },
  amber:   { ring: 'ring-amber-400/40',   text: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   glow: 'shadow-[0_0_24px_rgba(251,191,36,0.25)]' },
  emerald: { ring: 'ring-emerald-400/40', text: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', glow: 'shadow-[0_0_24px_rgba(52,211,153,0.25)]' },
  indigo:  { ring: 'ring-indigo-400/40',  text: 'text-indigo-300',  bg: 'bg-indigo-500/15',  border: 'border-indigo-500/40',  glow: 'shadow-[0_0_24px_rgba(129,140,248,0.25)]' },
  slate:   { ring: 'ring-slate-400/40',   text: 'text-slate-200',   bg: 'bg-slate-500/15',   border: 'border-slate-500/40',   glow: 'shadow-[0_0_24px_rgba(148,163,184,0.18)]' },
  rose:    { ring: 'ring-rose-400/40',    text: 'text-rose-300',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40',    glow: 'shadow-[0_0_24px_rgba(251,113,133,0.25)]' },
};

/** Header de section : icône colorée + titre + sous-titre (style cockpit) */
function SectionHeader({
  icon,
  label,
  subtitle,
  accent = 'sky',
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  accent?: AccentColor;
  badge?: React.ReactNode;
}) {
  const c = ACCENT_CLASSES[accent];
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${c.border} ${c.bg} ${c.text}`}>
          {icon}
        </span>
        <div>
          <h3 className="text-base font-semibold text-slate-100 leading-tight">{label}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </div>
  );
}

/** Carte cliquable pour choisir un mode de vol (Personnel / Commercial / Ferry) */
function ModeCard({
  active,
  accent,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  accent: AccentColor;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const c = ACCENT_CLASSES[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all duration-200 active:scale-[0.98] ${
        active
          ? `${c.border} ${c.bg} ${c.glow}`
          : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-500/60 hover:bg-slate-800/70'
      }`}
      aria-pressed={active}
    >
      {/* Indicateur LED actif */}
      {active && (
        <span className={`absolute right-2 top-2 inline-flex h-2 w-2 rounded-full ${c.text.replace('text-', 'bg-')} animate-pulse`} />
      )}
      <div className="flex items-center gap-2.5">
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? c.bg : 'bg-slate-700/50'} ${active ? c.text : 'text-slate-400'} transition-colors`}>
          {icon}
        </span>
        <div className="min-w-0">
          <div className={`text-sm font-semibold leading-tight ${active ? 'text-slate-50' : 'text-slate-200'}`}>{title}</div>
          <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

/** Visuel de route : DEP — ✈ — ARR avec ligne pointillée animée */
function RouteVisual({ depart, arrivee }: { depart: string; arrivee: string }) {
  const dep = depart ? getAeroportInfo(depart) : null;
  const arr = arrivee ? getAeroportInfo(arrivee) : null;
  const sameAirport = depart && arrivee && depart === arrivee;
  const ready = depart && arrivee && !sameAirport;

  return (
    <div className="mt-4 relative overflow-hidden rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-900/80 p-3 sm:p-4">
      {/* Grille radar de fond */}
      <div className="pointer-events-none absolute inset-0 bg-cockpit-grid opacity-50" />
      {/* Halos d'extrémité */}
      <div className="pointer-events-none absolute -left-8 top-1/2 -translate-y-1/2 h-20 w-20 rounded-full bg-sky-500/10 blur-2xl" />
      <div className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />

      <div className="relative flex items-stretch gap-2 sm:gap-3">
        {/* Aéroport départ */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[10px] font-mono uppercase tracking-widest text-sky-400/80 mb-0.5">DEP</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-sky-200 tabular-nums">
            {depart || '----'}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{dep?.nom || '—'}</div>
          {dep?.taille && (
            <span className="mt-1 inline-block text-[9px] font-mono uppercase tracking-widest text-sky-400/60">
              {dep.taille}
            </span>
          )}
        </div>

        {/* Ligne de route avec avion */}
        <div className="relative flex flex-col items-center justify-center min-w-[60px] sm:min-w-[120px]">
          <svg
            viewBox="0 0 200 30"
            className="w-full h-6 sm:h-8"
            aria-hidden
          >
            <defs>
              <linearGradient id="route-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
            {/* Ligne pointillée */}
            <line
              x1="0" y1="15" x2="200" y2="15"
              stroke={ready ? 'url(#route-grad)' : 'rgba(148,163,184,0.3)'}
              strokeWidth="2"
              strokeDasharray="6 4"
              className={ready ? 'animate-dash-flow' : ''}
            />
            {/* Petits points aux extrémités */}
            <circle cx="0" cy="15" r="3" fill={ready ? '#38bdf8' : 'rgba(148,163,184,0.4)'} />
            <circle cx="200" cy="15" r="3" fill={ready ? '#34d399' : 'rgba(148,163,184,0.4)'} />
          </svg>
          {/* Avion qui glisse */}
          {ready ? (
            <Plane className="absolute h-5 w-5 text-sky-300 -rotate-12 left-0 top-1/2 -translate-y-1/2 animate-plane-glide drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]" />
          ) : (
            <Plane className="absolute h-5 w-5 text-slate-600 -rotate-12 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          )}
          {sameAirport && (
            <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-amber-400">
              ⚠ identique
            </div>
          )}
        </div>

        {/* Aéroport arrivée */}
        <div className="flex-1 min-w-0 text-right">
          <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/80 mb-0.5">ARR</div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-emerald-200 tabular-nums">
            {arrivee || '----'}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{arr?.nom || '—'}</div>
          {arr?.taille && (
            <span className="mt-1 inline-block text-[9px] font-mono uppercase tracking-widest text-emerald-400/60">
              {arr.taille}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Gauge de remplissage avec barre animée et indicateur de seuil 25% */
function FillGauge({
  label,
  icon,
  current,
  max,
  unit,
  valid,
  accent,
}: {
  label: string;
  icon: React.ReactNode;
  current: number;
  max: number;
  unit: string;
  valid: boolean;
  accent: AccentColor;
}) {
  const c = ACCENT_CLASSES[accent];
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const barColor = !valid ? 'from-rose-500 to-rose-400' : accent === 'amber' ? 'from-amber-500 to-amber-300' : 'from-sky-500 to-cyan-300';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-xs">
        <div className={`flex items-center gap-1.5 font-mono uppercase tracking-widest ${c.text}`}>
          {icon}
          {label}
        </div>
        <div className={`font-mono font-semibold tabular-nums ${valid ? 'text-slate-200' : 'text-rose-300'}`}>
          {current.toLocaleString('fr-FR')}<span className="text-slate-500 mx-0.5">/</span>{max.toLocaleString('fr-FR')}
          <span className="ml-1 text-slate-500">{unit}</span>
          <span className={`ml-2 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${valid ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
        {/* Marqueur seuil 25% */}
        <div className="absolute top-0 bottom-0 w-px bg-slate-500/60" style={{ left: '25%' }} aria-hidden />
        <div
          className={`h-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%`, backgroundSize: '200% 100%', animation: 'shimmer 3s ease-in-out infinite' }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span className={valid ? 'text-emerald-400' : 'text-rose-400'}>● seuil 25%</span>
        <span>capacité max</span>
      </div>
    </div>
  );
}

/** Bouton submit avec animation de décollage en loading */
function SubmitButton({ loading, disabled }: { loading: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`group relative w-full overflow-hidden rounded-2xl px-6 py-4 font-bold text-base text-white shadow-xl transition-all duration-300 ${
        disabled
          ? 'bg-slate-700/60 text-slate-400 cursor-not-allowed'
          : 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 hover:from-sky-500 hover:via-blue-500 hover:to-indigo-500 hover:shadow-[0_18px_48px_rgba(14,165,233,0.45)] active:scale-[0.99]'
      }`}
    >
      {/* Ligne d'horizon défilante en bas (subtle) */}
      {!disabled && (
        <span
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-70"
          style={{ backgroundSize: '200% 100%', animation: 'shimmer 2.4s linear infinite' }}
        />
      )}
      {/* Brillance qui balaye au hover */}
      {!disabled && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}

      <span className="relative flex items-center justify-center gap-3">
        {loading ? (
          <>
            <span className="relative inline-flex h-5 w-5 items-center justify-center">
              <Plane className="h-5 w-5 -rotate-12 animate-plane-takeoff" />
            </span>
            <span className="font-mono uppercase tracking-widest text-sm animate-pulse">Décollage en cours…</span>
          </>
        ) : (
          <>
            <Send className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-0.5" />
            <span className="tracking-wide">Déposer le plan de vol</span>
            <span className="hidden sm:inline-flex h-5 items-center rounded-md border border-white/20 bg-white/10 px-1.5 text-[10px] font-mono uppercase tracking-widest">
              FILE
            </span>
          </>
        )}
      </span>
    </button>
  );
}
