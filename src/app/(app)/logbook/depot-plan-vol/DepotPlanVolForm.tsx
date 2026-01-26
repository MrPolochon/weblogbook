'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AEROPORTS_PTFS, getAeroportInfo, calculerCoefficientRemplissage, estimerCargo, calculerCoefficientChargementCargo, genererTypeCargaison, getCargaisonInfo, TypeCargaison } from '@/lib/aeroports-ptfs';
import { Building2, Plane, Users, Weight, DollarSign, Shield, Radio } from 'lucide-react';

interface TypeAvion {
  id: string;
  nom: string;
  code_oaci: string | null;
  capacite_pax: number;
  capacite_cargo_kg: number;
  est_militaire?: boolean;
}

interface FlotteItem {
  id: string;
  type_avion_id: string;
  quantite: number;
  disponibles: number;
  nom_personnalise: string | null;
  capacite_pax_custom: number | null;
  capacite_cargo_custom: number | null;
  types_avion: TypeAvion | null;
}

interface InventaireItem {
  id: string;
  type_avion_id: string;
  nom_personnalise: string | null;
  disponible: boolean;
  types_avion: TypeAvion | null;
}

interface Compagnie {
  id: string;
  nom: string;
  prix_billet_pax: number;
  prix_kg_cargo: number;
  pourcentage_salaire: number;
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
}

interface FlotteItemWithCompagnie extends FlotteItem {
  compagnie_id: string;
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
  flotteParCompagnie: Record<string, FlotteItemWithCompagnie[]>;
  inventairePersonnel: InventaireItem[];
  avionsParCompagnie?: Record<string, AvionIndividuel[]>;
}

export default function DepotPlanVolForm({ compagniesDisponibles, flotteParCompagnie, inventairePersonnel, avionsParCompagnie = {} }: Props) {
  const router = useRouter();
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
  const [note_atc, setNoteAtc] = useState('');
  
  // Commercial flight options
  const [vol_commercial, setVolCommercial] = useState(false);
  const [vol_ferry, setVolFerry] = useState(false);
  const [selectedCompagnieId, setSelectedCompagnieId] = useState('');
  const [nature_transport, setNatureTransport] = useState<'passagers' | 'cargo'>('passagers');
  const [flotte_avion_id, setFlotteAvionId] = useState('');
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
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get selected company and its fleet
  const selectedCompagnie = compagniesDisponibles.find(c => c.id === selectedCompagnieId) || null;
  const flotteCompagnie = selectedCompagnieId ? (flotteParCompagnie[selectedCompagnieId] || []) : [];
  
  // Get individual aircraft for the selected company, filtered by departure airport
  const avionsCompagnie = selectedCompagnieId ? (avionsParCompagnie[selectedCompagnieId] || []) : [];
  const avionsDisponibles = avionsCompagnie.filter(a => 
    a.statut === 'ground' && 
    a.usure_percent > 0 &&
    (!aeroport_depart || a.aeroport_actuel === aeroport_depart.toUpperCase())
  );
  
  // Get selected aircraft info
  const selectedFlotte = flotteCompagnie.find(f => f.id === flotte_avion_id);
  const selectedInventaire = inventairePersonnel.find(i => i.id === inventaire_avion_id);
  const selectedAvionIndiv = avionsCompagnie.find(a => a.id === compagnie_avion_id);
  
  // Auto-select company if only one available
  useEffect(() => {
    if (compagniesDisponibles.length === 1 && !selectedCompagnieId) {
      setSelectedCompagnieId(compagniesDisponibles[0].id);
    }
  }, [compagniesDisponibles, selectedCompagnieId]);

  // Reset flotte selection when company changes
  useEffect(() => {
    setFlotteAvionId('');
    setCompagnieAvionId('');
  }, [selectedCompagnieId]);

  // Reset individual aircraft selection when departure airport changes
  useEffect(() => {
    setCompagnieAvionId('');
  }, [aeroport_depart]);

  // Charger les tarifs par liaison quand la compagnie change
  useEffect(() => {
    if (!selectedCompagnieId) {
      setTarifsLiaisons([]);
      return;
    }
    
    fetch(`/api/tarifs-liaisons?compagnie_id=${selectedCompagnieId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTarifsLiaisons(data);
      })
      .catch(() => {});
  }, [selectedCompagnieId]);

  // Charger les passagers disponibles quand l'aéroport de départ change
  useEffect(() => {
    if (!aeroport_depart) {
      setPassagersAeroport(null);
      return;
    }
    
    fetch(`/api/aeroport-passagers?code_oaci=${aeroport_depart}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.code_oaci) setPassagersAeroport(data);
      })
      .catch(() => {});
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
    // Doit avoir un avion sélectionné (soit flotte par type, soit avion individuel)
    const hasAircraft = flotte_avion_id || compagnie_avion_id;
    // Vol ferry = vol à vide, pas de passagers/cargo
    if (vol_ferry || !vol_commercial || !selectedCompagnie || !hasAircraft || !aeroport_depart || !aeroport_arrivee) {
      setGeneratedPax(0);
      setGeneratedCargo(0);
      setLastGeneratedKey('');
      return;
    }

    // Obtenir le type d'avion (priorité avion individuel > flotte par type)
    const avionIndivType = selectedAvionIndiv?.types_avion 
      ? (Array.isArray(selectedAvionIndiv.types_avion) ? selectedAvionIndiv.types_avion[0] : selectedAvionIndiv.types_avion)
      : null;
    const avion = avionIndivType || selectedFlotte?.types_avion;
    if (!avion) return;

    const capacitePax = selectedFlotte?.capacite_pax_custom ?? avion.capacite_pax ?? 0;
    const capaciteCargo = selectedFlotte?.capacite_cargo_custom ?? avion.capacite_cargo_kg ?? 0;
    const prixCargo = selectedCompagnie.prix_kg_cargo || 0;

    // Clé unique pour régénérer seulement quand les paramètres importants changent
    // NE PAS inclure nature_transport pour éviter la régénération en basculant entre passagers/cargo
    const aircraftKey = compagnie_avion_id || flotte_avion_id;
    const generationKey = `${aircraftKey}-${aeroport_depart}-${aeroport_arrivee}-${prixBilletLiaison}-${prixCargo}`;
    if (generationKey === lastGeneratedKey) {
      return;
    }

    // Générer les valeurs UNE FOIS pour passagers ET cargo (pas de régénération en changeant le type)
    let pax = 0;
    let cargo = 0;

    // Calcul pour les PASSAGERS (toujours calculé, même si cargo sélectionné)
    if (capacitePax > 0) {
      // Calculer le coefficient de remplissage basé sur prix, taille aéroport et tourisme
      const coefRemplissage = calculerCoefficientRemplissage(aeroport_depart, aeroport_arrivee, prixBilletLiaison);
      
      // Facteur de saturation (si beaucoup de vols ont déjà pris des passagers)
      let coefSaturation = 1.0;
      if (passagersAeroport && passagersAeroport.passagers_max > 0) {
        const ratioDisponibles = passagersAeroport.passagers_disponibles / passagersAeroport.passagers_max;
        // Si moins de 50% de passagers disponibles, le remplissage diminue
        if (ratioDisponibles < 0.5) {
          coefSaturation = 0.5 + ratioDisponibles; // Entre 0.5 et 1.0
        }
      }
      
      // Coefficient final (inclut les bonus/malus)
      const coefFinal = coefRemplissage * coefSaturation;
      
      // Le coefficient de remplissage représente directement le taux de remplissage (0 à 1.15)
      // On applique une variation aléatoire de ±10% pour plus de réalisme
      const variation = 0.10;
      const coefMin = Math.max(0, coefFinal - variation);
      const coefMax = Math.min(1.15, coefFinal + variation);
      
      // Générer un coefficient aléatoire dans cette plage
      const coefAleatoire = coefMin + Math.random() * (coefMax - coefMin);
      
      // Calculer les passagers directement avec ce coefficient
      pax = Math.floor(capacitePax * coefAleatoire);
      
      // Limiter aux passagers disponibles dans l'aéroport
      if (passagersAeroport) {
        pax = Math.min(pax, passagersAeroport.passagers_disponibles);
      }
    }

    // Calcul pour le CARGO (toujours calculé, même si passagers sélectionné)
    if (capaciteCargo > 0 && prixCargo > 0) {
      const cargoDisponible = cargoAeroport?.cargo_disponible ?? getAeroportInfo(aeroport_depart)?.cargoMax ?? 0;
      
      // Utiliser estimerCargo pour avoir une estimation réaliste basée sur le prix cargo
      const estimation = estimerCargo(
        aeroport_depart,
        aeroport_arrivee,
        prixCargo,
        capaciteCargo,
        cargoDisponible
      );
      
      // Utiliser directement l'estimation (qui est déjà une moyenne réaliste)
      // On peut ajouter une petite variation aléatoire pour plus de réalisme (±15%)
      const variation = estimation.cargo * 0.15;
      const minCargo = Math.max(0, Math.floor(estimation.cargo - variation));
      const maxCargo = Math.min(cargoDisponible, Math.floor(estimation.cargo + variation));
      
      cargo = Math.floor(Math.random() * (Math.max(1, maxCargo - minCargo) + 1)) + minCargo;
    }

    setGeneratedPax(pax);
    setGeneratedCargo(cargo);
    // Générer un type de cargaison estimé (le serveur générera le vrai type)
    setEstimatedTypeCargaison(genererTypeCargaison());
    setLastGeneratedKey(generationKey);
  }, [vol_commercial, vol_ferry, flotte_avion_id, compagnie_avion_id, selectedCompagnie, selectedFlotte, selectedAvionIndiv, lastGeneratedKey, aeroport_depart, aeroport_arrivee, prixBilletLiaison, passagersAeroport, cargoAeroport]);

  // Calculer les revenus basés sur les valeurs générées et le type de transport sélectionné
  const nbPax = nature_transport === 'passagers' ? generatedPax : 0;
  const cargoKg = nature_transport === 'cargo' ? generatedCargo : 0;
  const revenuBrut = nature_transport === 'passagers' 
    ? generatedPax * prixBilletLiaison
    : generatedCargo * (selectedCompagnie?.prix_kg_cargo || 0);
  const salairePilote = Math.floor(revenuBrut * (selectedCompagnie?.pourcentage_salaire || 0) / 100);

  // Calculer les capacités et taux de remplissage
  // Priorité : avion individuel > flotte par type
  const avionType = selectedAvionIndiv?.types_avion 
    ? (Array.isArray(selectedAvionIndiv.types_avion) ? selectedAvionIndiv.types_avion[0] : selectedAvionIndiv.types_avion)
    : selectedFlotte?.types_avion;
  const capacitePaxMax = selectedFlotte?.capacite_pax_custom ?? avionType?.capacite_pax ?? 0;
  const capaciteCargoMax = selectedFlotte?.capacite_cargo_custom ?? avionType?.capacite_cargo_kg ?? 0;
  
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
      route_ifr: type_vol === 'IFR' && route_ifr.trim() ? route_ifr.trim() : undefined,
      note_atc: !volSansAtc && note_atc.trim() ? note_atc.trim() : undefined,
      vol_commercial: vol_commercial && !vol_ferry,
      compagnie_id: (vol_commercial || vol_ferry) && selectedCompagnieId ? selectedCompagnieId : undefined,
      nature_transport: vol_commercial && !vol_ferry ? nature_transport : undefined,
      flotte_avion_id: vol_commercial && !vol_ferry && flotte_avion_id ? flotte_avion_id : undefined,
      inventaire_avion_id: !vol_commercial && !vol_ferry && inventaire_avion_id ? inventaire_avion_id : undefined,
      compagnie_avion_id: (vol_commercial || vol_ferry) && compagnie_avion_id ? compagnie_avion_id : undefined,
      vol_ferry,
      nb_pax_genere: vol_commercial ? nbPax : undefined,
      cargo_kg_genere: vol_commercial ? cargoKg : undefined,
      revenue_brut: vol_commercial ? revenuBrut : undefined,
      salaire_pilote: vol_commercial ? salairePilote : undefined,
      prix_billet_utilise: vol_commercial ? prixBilletLiaison : undefined,
      vol_sans_atc: volSansAtc,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    // Accepter soit un avion individuel (nouveau système) soit un avion de flotte (ancien système)
    if (vol_commercial && !flotte_avion_id && !compagnie_avion_id) {
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
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  // Soumettre avec vol sans ATC
  async function handleSubmitSansAtc() {
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
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  const avionsPersonnelsDispo = inventairePersonnel.filter(i => i.disponible);

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 max-w-2xl">
      {/* Type de vol (commercial ou personnel) */}
      {compagniesDisponibles.length > 0 && (
        <div className="p-4 rounded-lg border border-sky-500/30 bg-sky-500/10 space-y-3">
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={vol_commercial} 
                onChange={(e) => {
                  setVolCommercial(e.target.checked);
                  if (e.target.checked) setVolFerry(false);
                  if (!e.target.checked) {
                    setFlotteAvionId('');
                  }
                }}
                className="w-5 h-5 rounded"
              />
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-400" />
                <span className="font-medium text-slate-200">Vol commercial</span>
              </div>
            </label>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                checked={vol_ferry} 
                onChange={(e) => {
                  setVolFerry(e.target.checked);
                  if (e.target.checked) setVolCommercial(false);
                }}
                className="w-5 h-5 rounded"
              />
              <div className="flex items-center gap-2">
                <Plane className="h-5 w-5 text-amber-400" />
                <span className="font-medium text-slate-200">Vol ferry (à vide)</span>
              </div>
            </label>
          </div>
          
          {vol_ferry && (
            <p className="text-amber-400 text-sm">
              Vol à vide pour déplacer un avion. Pas de passagers/cargo. La compagnie paie les taxes aéroportuaires.
            </p>
          )}
          
          {/* Sélection de la compagnie si plusieurs disponibles */}
          {(vol_commercial || vol_ferry) && compagniesDisponibles.length > 1 && (
            <div>
              <label className="label">Pour quelle compagnie ? *</label>
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
            <p className="text-sm text-slate-300">
              Vol pour <span className="font-semibold text-sky-300">{selectedCompagnie.nom}</span>
              {selectedCompagnie.role === 'pdg' && <span className="text-amber-400 ml-1">(PDG)</span>}
            </p>
          )}
        </div>
      )}

      {/* Sélection de l'appareil */}
      {(vol_commercial || vol_ferry) && selectedCompagnie ? (
        <div className="space-y-3">
          {/* Ancien système par type - masqué si avions individuels disponibles */}
          {avionsCompagnie.length === 0 && vol_commercial && (
            <div>
              <label className="label">Appareil de la flotte *</label>
              <select 
                className="input w-full" 
                value={flotte_avion_id} 
                onChange={(e) => setFlotteAvionId(e.target.value)}
                required
              >
                <option value="">— Choisir un appareil —</option>
                {flotteCompagnie.filter(f => f.disponibles > 0).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom_personnalise || f.types_avion?.nom || 'Avion'} 
                    {f.types_avion?.code_oaci && ` (${f.types_avion.code_oaci})`}
                    {` - ${f.disponibles}/${f.quantite} dispo`}
                  </option>
                ))}
              </select>
              {flotteCompagnie.filter(f => f.disponibles > 0).length === 0 && (
                <p className="text-amber-400 text-sm mt-1">Aucun appareil disponible dans la flotte.</p>
              )}
            </div>
          )}

          {/* Nouveau système : avions individuels avec immatriculation */}
          {avionsCompagnie.length > 0 && (
            <div>
              <label className="label">
                {vol_ferry ? 'Avion à déplacer *' : 'Avion *'}
                <span className="text-slate-500 font-normal ml-2">— sélectionner un appareil à {aeroport_depart?.toUpperCase() || '...'}</span>
              </label>
              <select 
                className="input w-full" 
                value={compagnie_avion_id} 
                onChange={(e) => setCompagnieAvionId(e.target.value)}
                required
              >
                <option value="">— Choisir un avion —</option>
                {avionsDisponibles.map((a) => {
                  const typeNom = Array.isArray(a.types_avion) ? a.types_avion[0]?.nom : a.types_avion?.nom;
                  return (
                    <option key={a.id} value={a.id}>
                      {a.immatriculation} {a.nom_bapteme ? `"${a.nom_bapteme}"` : ''} — {typeNom || 'Avion'} — {a.aeroport_actuel} ({a.usure_percent}%)
                    </option>
                  );
                })}
              </select>
              {aeroport_depart && avionsDisponibles.length === 0 && avionsCompagnie.length > 0 && (
                <p className="text-amber-400 text-sm mt-1">
                  Aucun avion disponible à {aeroport_depart.toUpperCase()}. 
                  {avionsCompagnie.filter(a => a.statut === 'ground' && a.usure_percent > 0).length > 0 && (
                    <span> Avions ailleurs : {avionsCompagnie.filter(a => a.statut === 'ground' && a.usure_percent > 0).map(a => `${a.immatriculation} (${a.aeroport_actuel})`).join(', ')}</span>
                  )}
                </p>
              )}
              {selectedAvionIndiv && (
                <p className="text-emerald-400 text-sm mt-1">
                  ✓ Avion sélectionné : {selectedAvionIndiv.immatriculation} à {selectedAvionIndiv.aeroport_actuel}
                </p>
              )}
            </div>
          )}
          
          {/* Type de transport - masqué pour vols ferry */}
          {!vol_ferry && (
            <div>
              <label className="label">Type de transport</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={nature_transport === 'passagers'} 
                    onChange={() => setNatureTransport('passagers')} 
                  />
                  <Users className="h-4 w-4 text-slate-400" />
                  <span className="text-slate-300">Passagers</span>
                </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  checked={nature_transport === 'cargo'} 
                  onChange={() => setNatureTransport('cargo')} 
                />
                <Weight className="h-4 w-4 text-slate-400" />
                <span className="text-slate-300">Cargo</span>
              </label>
            </div>
          </div>
          )}

          {/* Aperçu revenus - masqué pour vols ferry */}
          {!vol_ferry && (flotte_avion_id || compagnie_avion_id) && aeroport_depart && aeroport_arrivee && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-emerald-300">Estimation revenus</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {nature_transport === 'passagers' ? (
                  <>
                    <p className="text-slate-300">{nbPax} passagers @ {prixBilletLiaison} F$</p>
                    <p className={`text-sm ${remplissageValidePax ? 'text-emerald-400' : 'text-red-400'}`}>
                      Remplissage : {nbPax}/{capacitePaxMax} ({Math.round(tauxRemplissagePax * 100)}%)
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-slate-300">{cargoKg.toLocaleString('fr-FR')} kg cargo @ {selectedCompagnie?.prix_kg_cargo || 0} F$/kg</p>
                    <p className={`text-sm ${remplissageValideCargo ? 'text-emerald-400' : 'text-red-400'}`}>
                      Remplissage : {cargoKg.toLocaleString('fr-FR')}/{capaciteCargoMax.toLocaleString('fr-FR')} kg ({Math.round(tauxRemplissageCargo * 100)}%)
                    </p>
                    {/* Type de cargaison estimé */}
                    {(() => {
                      const cargaisonInfo = getCargaisonInfo(estimatedTypeCargaison);
                      return (
                        <p className={`text-sm col-span-2 ${cargaisonInfo.color}`}>
                          {cargaisonInfo.icon} Type : {cargaisonInfo.nom}
                          {cargaisonInfo.sensibiliteRetard > 1 && (
                            <span className="text-amber-400 ml-2">⚡ Sensible au retard</span>
                          )}
                          {cargaisonInfo.bonusRevenu > 0 && (
                            <span className="text-emerald-400 ml-2">💰 +{cargaisonInfo.bonusRevenu}% bonus</span>
                          )}
                        </p>
                      );
                    })()}
                  </>
                )}
                <p className="text-slate-300">Revenu brut : {revenuBrut.toLocaleString('fr-FR')} F$</p>
                <p className="text-emerald-300 col-span-2">Votre salaire ({selectedCompagnie.pourcentage_salaire}%) : {salairePilote.toLocaleString('fr-FR')} F$</p>
              </div>
              {/* Avertissement remplissage insuffisant */}
              {vol_commercial && (
                (nature_transport === 'passagers' && !remplissageValidePax) ||
                (nature_transport === 'cargo' && !remplissageValideCargo)
              ) && (
                <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                  <p className="text-red-400 text-xs">
                    ⚠️ Remplissage insuffisant : minimum 25% requis pour déposer un plan de vol
                  </p>
                </div>
              )}
              {/* Indicateurs de facteurs */}
              <div className="mt-2 pt-2 border-t border-emerald-500/20 text-xs text-slate-400 space-y-1">
                {(() => {
                  const aeroportArr = getAeroportInfo(aeroport_arrivee);
                  const aeroportDep = getAeroportInfo(aeroport_depart);
                  return (
                    <>
                      {aeroportArr?.tourisme && <span className="text-amber-400">🏖️ Destination touristique (+15% demande)</span>}
                      {aeroportDep?.taille === 'international' && <span className="ml-2 text-sky-400">✈️ Aéroport international (prix moins impactant)</span>}
                      {passagersAeroport && passagersAeroport.passagers_disponibles < passagersAeroport.passagers_max * 0.5 && (
                        <span className="block text-orange-400">⚠️ Saturation: {Math.round(passagersAeroport.passagers_disponibles / passagersAeroport.passagers_max * 100)}% de passagers disponibles</span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-slate-600 bg-slate-800/50">
          <label className="label flex items-center gap-2">
            <Plane className="h-4 w-4 text-slate-400" />
            Mon appareil personnel
          </label>
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
                Achetez un avion sur le <a href="/marketplace" className="underline hover:text-amber-300">Marketplace</a> pour effectuer des vols personnels.
              </p>
            </div>
          )}
          {inventairePersonnel.length > 0 && avionsPersonnelsDispo.length === 0 && (
            <p className="text-amber-400 text-sm mt-2">
              Tous vos appareils sont actuellement en vol.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Aéroport de départ *</label>
          <select className="input" value={aeroport_depart} onChange={(e) => setAeroportDepart(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Aéroport d&apos;arrivée *</label>
          <select className="input" value={aeroport_arrivee} onChange={(e) => setAeroportArrivee(e.target.value)} required>
            <option value="">— Choisir —</option>
            {AEROPORTS_PTFS.map((a) => (
              <option key={a.code} value={a.code}>{a.code} – {a.nom}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Numéro de vol *</label>
          <input type="text" className="input" value={numero_vol} onChange={(e) => setNumeroVol(e.target.value)} required />
        </div>
        <div>
          <label className="label">Porte</label>
          <input type="text" className="input" value={porte} onChange={(e) => setPorte(e.target.value)} placeholder="Optionnel" />
        </div>
      </div>
      <div>
        <label className="label">Temps de vol prévu (minutes) *</label>
        <input type="number" className="input w-32" value={temps_prev_min} onChange={(e) => setTempsPrevMin(e.target.value)} min={1} required />
      </div>
      <div>
        <span className="label block">Type de vol *</span>
        <div className="flex gap-4 mt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" checked={type_vol === 'VFR'} onChange={() => setTypeVol('VFR')} />
            <span className="text-slate-300">VFR</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" checked={type_vol === 'IFR'} onChange={() => setTypeVol('IFR')} />
            <span className="text-slate-300">IFR</span>
          </label>
        </div>
      </div>
      {type_vol === 'VFR' && (
        <div>
          <label className="label">Intentions de vol *</label>
          <textarea className="input min-h-[80px]" value={intentions_vol} onChange={(e) => setIntentionsVol(e.target.value)} required />
        </div>
      )}
      {type_vol === 'IFR' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">SID de départ *</label>
              <input type="text" className="input" value={sid_depart} onChange={(e) => setSidDepart(e.target.value)} required />
            </div>
            <div>
              <label className="label">STAR d&apos;arrivée *</label>
              <input type="text" className="input" value={star_arrivee} onChange={(e) => setStarArrivee(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="label">Route IFR (optionnel)</label>
            <textarea 
              className="input min-h-[60px]" 
              value={route_ifr} 
              onChange={(e) => setRouteIfr(e.target.value)} 
              placeholder="DCT PUNTO DCT MARUK DCT..."
            />
          </div>
        </>
      )}
      
      {/* Note pour l'ATC */}
      <div>
        <label className="label">Note d&apos;attention pour l&apos;ATC (optionnel)</label>
        <textarea 
          className="input min-h-[60px]" 
          value={note_atc} 
          onChange={(e) => setNoteAtc(e.target.value)} 
          placeholder="Ex: Premier vol, demande assistance..."
        />
      </div>

      {/* Confirmation vol sans ATC */}
      {showNoAtcConfirm && (
        <div className="p-4 rounded-lg border-2 border-amber-500 bg-amber-500/20 space-y-3">
          <div className="flex items-start gap-3">
            <Radio className="h-6 w-6 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Aucun ATC disponible</p>
              <p className="text-sm text-amber-300/80 mt-1">
                Il n&apos;y a actuellement aucune fréquence ATC en ligne pour votre aéroport de départ ou d&apos;arrivée.
              </p>
              <p className="text-sm text-slate-300 mt-2">
                Voulez-vous effectuer ce vol sans ATC ? Votre plan sera automatiquement accepté et mis en autosurveillance. Vous serez payé normalement à la clôture.
              </p>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={handleSubmitSansAtc}
              disabled={loading}
              className="btn-primary bg-amber-600 hover:bg-amber-700 flex items-center gap-2"
            >
              <Radio className="h-4 w-4" />
              {loading ? 'Envoi...' : 'Oui, voler sans ATC'}
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
      
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button 
        type="submit" 
        className="btn-primary" 
        disabled={
          loading || 
          showNoAtcConfirm || 
          (vol_commercial && (
            (nature_transport === 'passagers' && !remplissageValidePax) ||
            (nature_transport === 'cargo' && !remplissageValideCargo)
          ))
        }
      >
        {loading ? 'Envoi…' : 'Déposer le plan de vol'}
      </button>
    </form>
  );
}
