export type MajorConfig = {
  event_id: string; airports: string[]; slot_minutes: number; pilot_capacity: number;
  atc_positions: string[]; enabled: boolean; bookings_open: boolean;
};
export type Reservation = {
  id: string; event_id: string | null; role: 'pilot' | 'atc'; airport: string; position: string | null;
  starts_at: string; ends_at: string; departure: string | null; arrival: string | null;
  departure_at: string | null; duration_minutes: number | null; callsign: string | null;
  aircraft: string | null; airline: string | null; movement: 'departure' | 'arrival' | null;
  status: 'confirmed' | 'waitlisted' | 'cancelled' | 'no_show'; ready_at: string | null;
  claimed_at: string | null; plan_id: string | null; mine: boolean; identifiant?: string;
  discord?: string | null; plan_status?: string | null;
};
