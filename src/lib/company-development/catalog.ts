/** Server-side seed adapter. The full source catalogues must never be imported by a client module. */
import { randomInt } from 'node:crypto';

type Source = Record<string, unknown>;
const str = (value: unknown) => typeof value === 'string' ? value : '';
const unlocks: Record<string, string> = { 'NUM-02': 'wifi', 'NUM-07': 'wifi_metered', 'NUM-09': 'wifi_free', 'CAB-02': 'seats', 'NUM-16': 'ife', 'NUM-23': 'ife_recent', 'NUM-25': 'ife_refresh', 'RES-02': 'codeshare', 'CAB-21': 'restauration', 'CAB-31': 'bagages', 'RES-06': 'correspondance' };
export function compileDevelopmentCatalog(research: Source[], cards: Source[], eventInput: Source[] | { aleas: Source[] }) {
  const ids = new Set(research.map(r => str(r.id)));
  if (ids.size !== research.length || !ids.size) throw Error('Catalogue de recherche invalide.');
  const researchRows = research.map(r => {
    const rank = Number(str(r.id).split('-')[1]) || 1;
    const prerequisites = Array.isArray(r.prerequis_visuels_proposes) ? r.prerequis_visuels_proposes.map(str) : [];
    if (prerequisites.some(id => !ids.has(id))) throw Error('Prérequis de recherche inconnu.');
    return { id: str(r.id), title: str(r.nom), domain: str(r.domaine), description: str(r.fonction_rp) || str(r.deblocage), panel: str(r.panel_debloque) || str(r.page), unlock_key: unlocks[str(r.id)] || `research:${str(r.id)}`, cost: 2500 + rank * rank * 100, delay_seconds: Math.round(Math.min(72, 6 + rank * 1.5) * 3600), prerequisites, revenue_percent: r.classement === 'B' ? 0.1 : r.classement === 'M' ? 0.05 : 0 };
  });
  const cardRows = cards.map(c => {
    const required = str(c.recherche_requise) || null;
    if (required && !ids.has(required)) throw Error('Recherche de carte inconnue.');
    return { id: str(c.id), title: str(c.titre), domain: str(c.domaine), description: str(c.description), research_id: required, cost: Math.max(100, Math.round(Number(c.cout_base_indicatif_F) || 1000)), delay_seconds: Math.max(3600, Math.round((Number(c.delai_jours_indicatif) || 2) * 86400)), target_type: str(c.cible_type) || 'compagnie', activity: str(c.activite_eligible) || 'toutes', starter: required === null };
  });
  if (cardRows.filter(c => c.starter).length !== 25) throw Error('Le vivier de démarrage doit contenir les cartes prévues.');
  const eventRows = (Array.isArray(eventInput) ? eventInput : eventInput.aleas).map(e => {
    const mechanism = str(e.mecanisme);
    const effects: Record<string, number | boolean> = {};
    const positive = randomInt(2, 13);
    if (mechanism === 'carburant_hausse') effects.fuel_percent = randomInt(10, 41);
    if (mechanism === 'carburant_baisse') effects.fuel_percent = -randomInt(5, 21);
    if (mechanism === 'revenu_bonus') effects.revenue_percent = positive;
    if (mechanism === 'revenu_malus') effects.revenue_percent = -positive;
    if (mechanism === 'taxe_hausse') effects.airport_tax_percent = randomInt(5, 26);
    if (mechanism === 'taxe_baisse') effects.airport_tax_percent = -randomInt(5, 21);
    if (mechanism.startsWith('reparation_')) effects.repair_percent = mechanism.includes('baisse') ? -randomInt(5, 31) : randomInt(10, 81);
    if (mechanism.includes('delai') || mechanism.startsWith('delai_')) effects.repair_delay_percent = mechanism.includes('baisse') ? -randomInt(10, 41) : randomInt(10, 101);
    if (mechanism === 'inspection') { effects.inspection_required = true; effects.grounded = true; }
    if (mechanism === 'immobilisation_temporaire') effects.grounded = true;
    return { id: str(e.id), scenario_id: str(e.scenario_id), title: str(e.titre), description: str(e.description), selector: str(e.selecteur) || 'toutes', effects, duration_days: mechanism === 'immobilisation_temporaire' ? randomInt(2, 6) : randomInt(5, 16) };
  });
  return { research: researchRows, cards: cardRows, events: eventRows };
}
