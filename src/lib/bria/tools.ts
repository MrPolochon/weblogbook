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
  /** Legacy options are accepted for compatibility; these tools are read-only. */
  onPlanSubmitted?: (planId: string) => void;
}

/** Read-only compatibility helpers. The guided BRIA does not expose agent tools. */
export function createBriaClientTools(_opts?: CreateBriaClientToolsOpts) {
  return {
    get_aircraft_info: async (params: { immatriculation: string }) => {
      const res = await fetch(`/api/avions/lookup?immatriculation=${encodeURIComponent(params.immatriculation)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        return JSON.stringify({ error: err?.error ?? err?.error_detail ?? 'Avion introuvable' });
      }
      const data = await res.json();
      return JSON.stringify({
        autorise: true,
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
        compagnie_avion_id: data.compagnie_avion_id ?? null,
        inventaire_avion_id: data.inventaire_avion_id ?? null,
        compagnie_id: data.compagnie_id ?? null,
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
        const [departureRes, arrivalRes] = await Promise.all([
          fetch(`/api/aeroport-passagers?code_oaci=${encodeURIComponent(dep)}`),
          fetch(`/api/aeroport-passagers?code_oaci=${encodeURIComponent(arr)}`),
        ]);
        if (!departureRes.ok || !arrivalRes.ok) return JSON.stringify({ error: 'Stock passagers indisponible. Réessayez dans le formulaire.' });
        const departureData = await departureRes.json();
        const arrivalData = await arrivalRes.json();
        if (Array.isArray(departureData) || Array.isArray(arrivalData) || !Number.isFinite(departureData?.passagers_disponibles) || departureData.passagers_disponibles < 0) {
          return JSON.stringify({ error: 'Stock passagers indisponible. Réessayez dans le formulaire.' });
        }

        const ctx: CoefficientContext = {
          lastArrivalAtArrivee: arrivalData?.last_flight_arrival ? new Date(arrivalData.last_flight_arrival) : null,
          ratioPaxDispo: departureData.passagers_disponibles / (getAeroportInfo(dep)?.passagersMax || 1),
          capacitePax: aircraft.capacite_pax,
        };

        const prix = aircraft.prix_billet_pax ?? 100;
        const disponibles = departureData.passagers_disponibles;
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
        const [departureRes, arrivalRes] = await Promise.all([
          fetch(`/api/aeroport-cargo?code_oaci=${encodeURIComponent(dep)}`),
          fetch(`/api/aeroport-cargo?code_oaci=${encodeURIComponent(arr)}`),
        ]);
        if (!departureRes.ok || !arrivalRes.ok) return JSON.stringify({ error: 'Stock cargo indisponible. Réessayez dans le formulaire.' });
        const departureData = await departureRes.json();
        const arrivalData = await arrivalRes.json();
        if (Array.isArray(departureData) || Array.isArray(arrivalData) || !Number.isFinite(departureData?.cargo_disponible) || departureData.cargo_disponible < 0) {
          return JSON.stringify({ error: 'Stock cargo indisponible. Réessayez dans le formulaire.' });
        }

        const ctx: CoefficientContext = {
          lastArrivalAtArrivee: arrivalData?.last_flight_arrival ? new Date(arrivalData.last_flight_arrival) : null,
          ratioCargoDispo: departureData.cargo_disponible / (getAeroportInfo(dep)?.cargoMax || 1),
          capaciteCargoKg: aircraft.capacite_cargo_kg,
        };

        const prix = aircraft.prix_kg_cargo ?? 1;
        const disponible = departureData.cargo_disponible;
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

    get_current_utc_time: async () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      const yyyy = now.getUTCFullYear();
      const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      return JSON.stringify({
        utc_time: `${hh}:${mm}`,
        utc_time_with_seconds: `${hh}:${mm}:${ss}`,
        utc_date: `${yyyy}-${mo}-${dd}`,
        utc_iso: now.toISOString(),
        unix_seconds: Math.floor(now.getTime() / 1000),
        spoken: `${hh} heures ${mm} UTC`,
      });
    },

    get_ats_status: async (params: { code_oaci_depart: string }) => {
      const res = await fetch(`/api/atc-online?aeroport=${encodeURIComponent(params.code_oaci_depart.toUpperCase())}`);
      if (!res.ok) return JSON.stringify({ online: false, position: null, controllers: [] });
      return JSON.stringify(await res.json());
    },
  };
}
