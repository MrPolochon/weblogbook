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
  // Appelé après une soumission réussie : permet au composant parent
  // (BriaDialog) de raccrocher l'appel et rediriger le pilote vers
  // l'interface transpondeur (page plans-vol).
  onPlanSubmitted?: (planId: string) => void;
}

export function createBriaClientTools(opts: CreateBriaClientToolsOpts) {
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

    submit_flight_plan: async (params: { payload: Record<string, unknown> }) => {
      try {
        const conversation = opts.getConversationLog();
        const p = params.payload ?? {};

        const dep = String(p.aeroport_depart ?? '').toUpperCase();

        let atcOnline = false;
        try {
          const atcRes = await fetch(`/api/atc-online?aeroport=${encodeURIComponent(dep)}`);
          if (atcRes.ok) {
            const atcData = await atcRes.json();
            atcOnline = Boolean(atcData.online);
          }
        } catch { /* ignore */ }

        // Normalise l'heure de depart eventuellement fournie par l'agent BRIA :
        // accepte "HH:MM", "HHhMM", "HHMM", "1430Z", etc. Renvoie "HH:MM" UTC ou ''.
        const rawHeure = String(
          p.heure_depart ?? p.heure_depart_estimee ?? p.departure_time ?? ''
        ).trim().toUpperCase();
        const heureMatch = rawHeure.match(/^(\d{1,2})[:H ]?(\d{2})Z?$/);
        const heureDepart = heureMatch
          ? `${String(Math.min(23, parseInt(heureMatch[1], 10))).padStart(2, '0')}:${String(Math.min(59, parseInt(heureMatch[2], 10))).padStart(2, '0')}`
          : '';

        // Normalise le niveau de croisiere : "FL350", "350", "FL 350", "35000FT" -> "350"
        const rawFl = String(p.niveau_croisiere ?? p.cruise_level ?? p.altitude ?? '').trim().toUpperCase();
        let niveauCroisiere = '';
        const flMatch = rawFl.match(/FL\s*(\d{2,3})/);
        if (flMatch) niveauCroisiere = flMatch[1];
        else {
          const ftMatch = rawFl.match(/(\d{3,5})\s*(FT|FEET)?/);
          if (ftMatch) {
            const n = parseInt(ftMatch[1], 10);
            if (n >= 1000) niveauCroisiere = String(Math.round(n / 100)).padStart(3, '0');
            else if (n >= 10 && n <= 600) niveauCroisiere = String(n).padStart(3, '0');
          }
        }

        const sanitized: Record<string, unknown> = {
          ...p,
          aeroport_depart: dep,
          aeroport_arrivee: String(p.aeroport_arrivee ?? '').toUpperCase(),
          numero_vol: String(p.numero_vol ?? 'BRIA001').toUpperCase(),
          temps_prev_min: Number(p.temps_prev_min) || 30,
          heure_depart: heureDepart || undefined,
          type_vol: ['VFR', 'IFR'].includes(String(p.type_vol ?? '').toUpperCase())
            ? String(p.type_vol).toUpperCase() : 'VFR',
          niveau_croisiere: niveauCroisiere || undefined,
          vol_commercial: Boolean(p.vol_commercial),
          vol_sans_atc: !atcOnline,
          nb_pax_genere: Number(p.nb_pax_genere) || 0,
          cargo_kg_genere: Number(p.cargo_kg_genere) || 0,
          revenue_brut: 0,
          prix_billet_utilise: Number(p.prix_billet_utilise) || 0,
          bria_conversation: conversation,
        };

        if (sanitized.type_vol === 'VFR' && !sanitized.intentions_vol) {
          sanitized.intentions_vol = 'Vol déposé via BRIA';
        }

        const res = await fetch('/api/plans-vol', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sanitized),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('[BRIA] submit error:', data.error);
          return JSON.stringify({ success: false, error: data.error ?? 'Erreur soumission' });
        }
        // Notifie le parent : raccrochage + redirection vers la page transpondeur.
        // Léger délai pour laisser BRIA terminer sa phrase de confirmation vocale.
        if (opts.onPlanSubmitted) {
          setTimeout(() => opts.onPlanSubmitted?.(data.id), 1500);
        } else {
          setTimeout(() => opts.router.refresh(), 100);
        }
        return JSON.stringify({ success: true, id: data.id, statut: data.statut ?? 'accepte' });
      } catch (err) {
        console.error('[BRIA] submit_flight_plan exception:', err);
        return JSON.stringify({ success: false, error: 'Erreur technique lors de la soumission' });
      }
    },
  };
}
