import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
  getAeroportInfo,
  estimerPassagers,
  estimerCargo,
  type CoefficientContext,
} from '@/lib/aeroports-ptfs';

export type BriaMessage = { role: 'bria' | 'pilote'; text: string };

interface CreateBriaClientToolsOpts {
  getConversationLog: () => BriaMessage[];
  router: AppRouterInstance;
}

export function createBriaClientTools(opts: CreateBriaClientToolsOpts) {
  return {
    get_aircraft_info: async (params: { immatriculation: string }) => {
      const res = await fetch(`/api/avions/lookup?immatriculation=${encodeURIComponent(params.immatriculation)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        return JSON.stringify({ error: err?.error ?? 'Avion introuvable' });
      }
      const data = await res.json();
      return JSON.stringify({
        source: data.source,
        immatriculation: data.immatriculation,
        type: data.type_avion_nom,
        code_oaci: data.type_avion_code_oaci,
        constructeur: data.type_avion_constructeur,
        aeroport_actuel: data.aeroport_actuel,
        capacite_pax: data.capacite_pax,
        capacite_cargo_kg: data.capacite_cargo_kg,
        usure_percent: data.usure_percent,
        statut: data.statut,
        compagnie_nom: data.compagnie_nom ?? null,
        compagnie_code_oaci: data.compagnie_code_oaci ?? null,
        prix_billet_pax: data.prix_billet_pax ?? null,
        prix_kg_cargo: data.prix_kg_cargo ?? null,
      });
    },

    check_aircraft_position: async (params: { immatriculation: string; code_oaci_depart: string }) => {
      const res = await fetch(`/api/avions/lookup?immatriculation=${encodeURIComponent(params.immatriculation)}`);
      if (!res.ok) return JSON.stringify({ error: 'Avion introuvable' });
      const data = await res.json();
      const match = data.aeroport_actuel?.toUpperCase() === params.code_oaci_depart.toUpperCase();
      return JSON.stringify({
        immatriculation: data.immatriculation,
        aeroport_actuel: data.aeroport_actuel,
        code_oaci_depart: params.code_oaci_depart.toUpperCase(),
        position_correcte: match,
      });
    },

    estimate_load: async (params: {
      code_oaci_depart: string;
      code_oaci_arrivee: string;
      type: 'pax' | 'cargo';
      immatriculation: string;
    }) => {
      const aircraftRes = await fetch(`/api/avions/lookup?immatriculation=${encodeURIComponent(params.immatriculation)}`);
      if (!aircraftRes.ok) return JSON.stringify({ error: 'Avion introuvable' });
      const aircraft = await aircraftRes.json();

      const dep = params.code_oaci_depart.toUpperCase();
      const arr = params.code_oaci_arrivee.toUpperCase();

      if (params.type === 'pax') {
        const paxRes = await fetch(`/api/aeroport-passagers?code=${encodeURIComponent(arr)}`);
        const paxData = paxRes.ok ? await paxRes.json() : null;

        const ctx: CoefficientContext = {
          lastArrivalAtArrivee: paxData?.last_flight_arrival ? new Date(paxData.last_flight_arrival) : null,
          ratioPaxDispo: paxData ? paxData.passagers_disponibles / (getAeroportInfo(arr)?.passagersMax || 1) : undefined,
          capacitePax: aircraft.capacite_pax,
        };

        const prix = aircraft.prix_billet_pax ?? 100;
        const disponibles = paxData?.passagers_disponibles ?? aircraft.capacite_pax;
        const result = estimerPassagers(dep, arr, prix, aircraft.capacite_pax, disponibles, ctx);
        return JSON.stringify({
          type: 'pax',
          passagers_estimes: result.passagers,
          remplissage_pct: Math.round(result.remplissage * 100),
          revenus_estimes: result.revenus,
          prix_billet: prix,
          avertissement: result.avertissement,
        });
      } else {
        const cargoRes = await fetch(`/api/aeroport-cargo?code=${encodeURIComponent(arr)}`);
        const cargoData = cargoRes.ok ? await cargoRes.json() : null;

        const ctx: CoefficientContext = {
          lastArrivalAtArrivee: cargoData?.last_flight_arrival ? new Date(cargoData.last_flight_arrival) : null,
          ratioCargoDispo: cargoData ? cargoData.cargo_disponible / (getAeroportInfo(arr)?.cargoMax || 1) : undefined,
          capaciteCargoKg: aircraft.capacite_cargo_kg,
        };

        const prix = aircraft.prix_kg_cargo ?? 1;
        const disponible = cargoData?.cargo_disponible ?? aircraft.capacite_cargo_kg;
        const result = estimerCargo(dep, arr, prix, aircraft.capacite_cargo_kg, disponible, ctx);
        return JSON.stringify({
          type: 'cargo',
          cargo_kg_estimes: result.cargo,
          chargement_pct: Math.round(result.chargement * 100),
          revenus_estimes: result.revenus,
          prix_kg: prix,
          avertissement: result.avertissement,
        });
      }
    },

    get_sid_star: async (params: { code_oaci_depart: string; code_oaci_arrivee: string }) => {
      const [sidRes, starRes] = await Promise.all([
        fetch(`/api/sid-star?aeroport=${encodeURIComponent(params.code_oaci_depart.toUpperCase())}&type=SID`),
        fetch(`/api/sid-star?aeroport=${encodeURIComponent(params.code_oaci_arrivee.toUpperCase())}&type=STAR`),
      ]);
      const sids = sidRes.ok ? await sidRes.json() : [];
      const stars = starRes.ok ? await starRes.json() : [];
      return JSON.stringify({ sids, stars });
    },

    get_airport_info: async (params: { code_oaci: string }) => {
      const info = getAeroportInfo(params.code_oaci.toUpperCase());
      if (!info) return JSON.stringify({ error: 'Aéroport inconnu' });
      return JSON.stringify({
        code: info.code,
        nom: info.nom,
        taille: info.taille,
        tourisme: info.tourisme,
        industriel: info.industriel,
        passagersMax: info.passagersMax,
        cargoMax: info.cargoMax,
        vor: info.vor ?? null,
        freq: info.freq ?? null,
      });
    },

    get_ats_status: async (params: { code_oaci_depart: string }) => {
      const res = await fetch(`/api/atc-online?aeroport=${encodeURIComponent(params.code_oaci_depart.toUpperCase())}`);
      if (!res.ok) return JSON.stringify({ online: false, position: null, controllers: [] });
      return JSON.stringify(await res.json());
    },

    submit_flight_plan: async (params: { payload: Record<string, unknown> }) => {
      const conversation = opts.getConversationLog();
      const res = await fetch('/api/plans-vol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params.payload, bria_conversation: conversation }),
      });
      const data = await res.json();
      if (!res.ok) return JSON.stringify({ success: false, error: data.error ?? 'Erreur soumission' });
      opts.router.refresh();
      return JSON.stringify({ success: true, id: data.id, statut: data.statut ?? 'accepte' });
    },
  };
}
