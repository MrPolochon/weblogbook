/** Versioned, server-owned rules. Never accept a snapshot supplied by a browser. */
export const ECONOMY_VERSION = 2;
export type EconomySnapshot = {
  version: 2;
  reference_minutes: number;
  passenger_revenue: number;
  cargo_revenue: number;
  transition_adjustment: number;
  revenue_percent: number;
  fuel_cost: number;
  fuel_liters: number;
  salary_total: number;
  sensitive_cargo: boolean;
  wifi_enabled: boolean;
  wifi_price: number;
  ife_level: number;
  airport_tax_percent?: number;
  ticket_price?: number;
  cargo_price?: number;
};
export type SettlementTiming = {
  scheduledDepartureAt: string;
  actualDepartureAt: string;
  firstClosureRequestedAt: string;
  diverted?: boolean;
  taxRatePercent: number;
  taxBeneficiary: boolean;
  copilot?: boolean;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const finite = (n: number) => {
  if (!Number.isFinite(n)) throw new Error('Montant ou durée invalide.');
  return n;
};
/** Mirrors the atomic PostgreSQL settlement; helpful for previews and regressions. */
export function computeSettlement(snapshot: EconomySnapshot, observed: SettlementTiming) {
  if (snapshot.version !== ECONOMY_VERSION) throw new Error('Version économique incompatible.');
  const close = Date.parse(observed.firstClosureRequestedAt);
  const scheduled = Date.parse(observed.scheduledDepartureAt);
  const departure = Date.parse(observed.actualDepartureAt);
  [close, scheduled, departure, snapshot.reference_minutes].forEach(finite);
  const actualMinutes = (close - departure) / 60000;
  const minimum = Math.min(snapshot.reference_minutes, Math.max(2, Math.floor(snapshot.reference_minutes * .2)));
  if (actualMinutes < minimum) throw new Error('Durée de vol anormalement courte.');
  const delay = Math.max(0, (close - scheduled) / 60000 - snapshot.reference_minutes);
  const chargeable = Math.max(0, delay - 5);
  const normalPercent = Math.min(15, chargeable * .5);
  const cargoPercent = snapshot.sensitive_cargo ? Math.min(25, chargeable) : 0;
  const factor = Math.max(0, 1 + clamp(snapshot.revenue_percent, -70, 70) / 100);
  // The transition allowance is fixed at quote creation. It is exposed separately,
  // affected by punctuality/diversion, and never recomputed from the realised profit.
  const base = snapshot.passenger_revenue + snapshot.cargo_revenue;
  const total = Math.round((base + snapshot.transition_adjustment) * factor);
  const pax = base > 0 ? Math.round(total * snapshot.passenger_revenue / base) : 0;
  const cargo = total - pax;
  const passengerReceipt = Math.round(pax * (1 - normalPercent / 100));
  const cargoReceipt = Math.round(cargo * Math.max(0, 1 - (normalPercent + cargoPercent) / 100));
  const gross = Math.round((passengerReceipt + cargoReceipt) * (observed.diverted ? .5 : 1));
  const tax = observed.diverted || observed.taxBeneficiary
    ? Math.round(gross * clamp(finite(observed.taxRatePercent), 0, 100) / 100 * (1 + clamp(snapshot.airport_tax_percent ?? 0, -90, 300) / 100) * (observed.diverted ? 20 : 1)) : 0;
  const salary = Math.max(0, Math.round(snapshot.salary_total));
  const copilotSalary = observed.copilot ? Math.floor(salary / 2) : 0;
  return { gross_revenue: gross, airport_tax: tax, fuel_cost: snapshot.fuel_cost, salary_total: salary,
    captain_salary: salary - copilotSalary, copilot_salary: copilotSalary,
    company_net: gross - tax - snapshot.fuel_cost - salary,
    delay_minutes: delay, actual_minutes: actualMinutes, reference_minutes: snapshot.reference_minutes,
    delay_discount_percent: normalPercent, cargo_delay_discount_percent: cargoPercent,
    passenger_revenue: passengerReceipt, cargo_revenue: cargoReceipt, diverted: !!observed.diverted,
    transition_adjustment: snapshot.transition_adjustment, wifi_enabled: snapshot.wifi_enabled,
    wifi_price: snapshot.wifi_price, ife_level: snapshot.ife_level };
}
