type Booking = {role:string;status:string;plan_id?:string|null;claimed_at?:string|null;plan_status?:string|null};
/** Le créneau est réservé avant le dépôt ; l'inscription pilote attend le plan. */
export function pilotNeedsFlightPlan(booking:Booking):boolean {
  return booking.role==='pilot' && booking.status==='confirmed' && !booking.plan_id && !booking.claimed_at;
}
export function registrationLabel(booking:Booking):string {
  if(booking.status==='waitlisted') return 'Liste d’attente';
  if(booking.status==='cancelled') return 'Annulé';
  if(booking.status==='no_show') return 'Absent';
  if(pilotNeedsFlightPlan(booking)) return 'Plan de vol à compléter';
  if(booking.plan_status==='annule'||booking.plan_status==='refuse') return 'Plan annulé ou refusé';
  return 'Inscription confirmée';
}
export const planBookingUrl=(id:string)=>`/logbook/depot-plan-vol?reservation=${encodeURIComponent(id)}`;
