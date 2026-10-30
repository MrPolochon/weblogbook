import {
  CODES_OACI_VALIDES, calculerCoefficientRemplissage, calculerCoefficientChargementCargo,
  genererTypeCargaison, genererTypeCargaisonComplementaire, getMarchandiseRareAleatoire, getCargaisonInfo,
} from '@/lib/aeroports-ptfs';
import { isCompanyMember } from './crew';
import type { createAdminClient } from '@/lib/supabase/admin';

type Admin = ReturnType<typeof createAdminClient>;
export class FlightSubmissionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function submissionError(error: { code?: string; message?: string } | null): FlightSubmissionError {
  if (error?.code === 'PGRST202' || error?.code === '42883' || error?.code === '42P01') {
    return new FlightSubmissionError('Le dépôt sécurisé est temporairement indisponible : mise à jour de la base requise.', 503);
  }
  return new FlightSubmissionError(error?.message || 'Impossible de confirmer le plan de vol.', 409);
}
const identifier = (value: unknown) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new FlightSubmissionError('Identifiant d’appareil ou de compagnie invalide.');
  return value.toLowerCase();
};
const amount = (value: unknown) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
export function quoteScope(body: Record<string, unknown>) {
  const ad = String(body.aeroport_depart || '').trim().toUpperCase();
  const aa = String(body.aeroport_arrivee || '').trim().toUpperCase();
  if (!CODES_OACI_VALIDES.has(ad) || !CODES_OACI_VALIDES.has(aa)) throw new FlightSubmissionError('Aéroports invalides.');
  const company = identifier(body.compagnie_id), aircraft = identifier(body.compagnie_avion_id), personal = identifier(body.inventaire_avion_id);
  const ferry = body.vol_ferry === true, commercial = body.vol_commercial === true && !ferry;
  const nature = commercial ? String(body.nature_transport || 'passagers') : null;
  if (nature && !['passagers', 'cargo'].includes(nature)) throw new FlightSubmissionError('Nature du transport invalide.');
  if ((company || aircraft || commercial || ferry) && (!company || !aircraft)) throw new FlightSubmissionError('Sélectionnez la compagnie et son appareil.');
  if (personal && (company || aircraft || commercial || ferry)) throw new FlightSubmissionError('Un vol ne peut pas combiner appareil personnel et compagnie.');
  return { aeroport_depart: ad, aeroport_arrivee: aa, compagnie_id: company, compagnie_avion_id: aircraft, inventaire_avion_id: personal, vol_commercial: commercial, vol_ferry: ferry, nature_transport: nature };
}
export interface FlightQuote {
  quote_id: string; expires_at: string; nb_pax_genere: number; cargo_kg_genere: number;
  revenue_brut: number; salaire_pilote: number; prix_billet_utilise: number; prix_kg_cargo_utilise: number;
  type_cargaison: string | null; type_cargaison_libelle: string | null;
  economy_version?: 1 | 2;
  economy_snapshot?: import('@/lib/flight-economy/calculator').EconomySnapshot;
}
/** The database opts new quotes into the enabled economy. Daily draws survive
 * cancellation, price edits and repeated previews, across both economy versions. */
export async function getFlightQuote(admin: Admin, actor: string, body: Record<string, unknown>): Promise<FlightQuote> {
  const scope = quoteScope(body);
  let company: Record<string, any> | null = null;
  let capacityPax = 0, capacityCargo = 0;
  if (scope.compagnie_id) {
    if (!await isCompanyMember(admin, actor, scope.compagnie_id)) throw new FlightSubmissionError('Vous n’appartenez pas à cette compagnie.', 403);
    const { data, error } = await admin.from('compagnies').select('prix_billet_pax,prix_kg_cargo,pourcentage_salaire').eq('id', scope.compagnie_id).single();
    if (error || !data) throw new FlightSubmissionError('Compagnie introuvable.', 404);
    company = data;
    const { data: aircraft, error: aircraftError } = await admin.from('compagnie_avions').select('id,compagnie_id,types_avion:type_avion_id(capacite_pax,capacite_cargo_kg)').eq('id', scope.compagnie_avion_id!).single();
    if (aircraftError || !aircraft) throw new FlightSubmissionError('Appareil de compagnie introuvable.', 404);
    if (aircraft.compagnie_id !== scope.compagnie_id) {
      const now = new Date().toISOString();
      const { data: lease, error: leaseError } = await admin.from('compagnie_locations').select('id').eq('avion_id', aircraft.id).eq('locataire_compagnie_id', scope.compagnie_id).eq('statut', 'active').lte('start_at', now).gte('end_at', now).maybeSingle();
      if (leaseError || !lease) throw new FlightSubmissionError('Cet appareil n’est pas disponible pour cette compagnie.', 403);
    }
    const type = Array.isArray(aircraft.types_avion) ? aircraft.types_avion[0] : aircraft.types_avion;
    capacityPax = amount(type?.capacite_pax); capacityCargo = amount(type?.capacite_cargo_kg);
  }
  if (scope.inventaire_avion_id) {
    const { data, error } = await admin.from('inventaire_avions').select('id,proprietaire_id').eq('id', scope.inventaire_avion_id).single();
    if (error || !data || data.proprietaire_id !== actor) throw new FlightSubmissionError('Cet appareil personnel ne vous appartient pas.', 403);
  }
  let pax = 0, cargo = 0, ticket = 0, kg = 0, type: string | null = null, label: string | null = null;
  if (scope.vol_commercial && company) {
    ticket = amount(company.prix_billet_pax); kg = amount(company.prix_kg_cargo);
    const [tariffResult, sourceResult, targetResult] = await Promise.all([
      admin.from('tarifs_liaisons').select('prix_billet').eq('compagnie_id', scope.compagnie_id!).eq('aeroport_depart', scope.aeroport_depart).eq('aeroport_arrivee', scope.aeroport_arrivee).maybeSingle(),
      admin.from('aeroports').select('passagers_disponibles,passagers_max,cargo_disponible,cargo_max').eq('code_oaci', scope.aeroport_depart).single(),
      admin.from('aeroports').select('last_flight_arrival').eq('code_oaci', scope.aeroport_arrivee).single(),
    ]);
    if (tariffResult.error || sourceResult.error || targetResult.error || !sourceResult.data || !targetResult.data) throw new FlightSubmissionError('Les tarifs ou stocks de ce trajet sont indisponibles.', 503);
    if (tariffResult.data?.prix_billet != null) ticket = amount(tariffResult.data.prix_billet);
    const source = sourceResult.data;
    const context = { lastArrivalAtArrivee: targetResult.data.last_flight_arrival ? new Date(targetResult.data.last_flight_arrival) : null, ratioPaxDispo: source.passagers_max > 0 ? source.passagers_disponibles / source.passagers_max : 0, ratioCargoDispo: source.cargo_max > 0 ? source.cargo_disponible / source.cargo_max : 0, capacitePax: capacityPax, capaciteCargoKg: capacityCargo };
    if (scope.nature_transport === 'passagers') pax = Math.min(Math.floor(capacityPax * calculerCoefficientRemplissage(scope.aeroport_depart, scope.aeroport_arrivee, ticket, context)), capacityPax, amount(source.passagers_disponibles));
    cargo = Math.min(Math.floor(capacityCargo * calculerCoefficientChargementCargo(scope.aeroport_depart, scope.aeroport_arrivee, kg, context)), capacityCargo, amount(source.cargo_disponible));
    if (cargo > 0) {
      type = scope.nature_transport === 'passagers' ? genererTypeCargaisonComplementaire() : genererTypeCargaison();
      if (type === 'marchandise_rare') label = getMarchandiseRareAleatoire();
    }
  }
  const { data, error } = await admin.rpc('get_flight_submission_quote', { p_actor: actor, p_scope: scope, p_candidate: { nb_pax_genere: pax, cargo_kg_genere: cargo, type_cargaison: type, type_cargaison_libelle: label, cargo_bonus_percent: type === 'marchandise_rare' ? getCargaisonInfo(type).bonusRevenu : 0, prix_billet_reference: scope.nature_transport === 'cargo' ? kg : ticket, prix_kg_reference: kg, flight_rules: body.type_vol === 'VFR' ? 'VFR' : 'IFR' } });
  if (error || !data) throw submissionError(error);
  if (body.quote_id && body.quote_id !== data.quote_id) throw new FlightSubmissionError('Le devis du vol a expiré. Actualisez le chargement.', 409);
  return data as FlightQuote;
}
