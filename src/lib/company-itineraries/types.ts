export type ItineraryStatus = 'planned' | 'active' | 'paused' | 'completed' | 'cancelled' | 'diverted';
export interface ItineraryLeg {
  id: string; itinerary_id: string; leg_index: number; origin: string; destination: string;
  preparation: Record<string, unknown>; status: 'planned' | 'active' | 'completed' | 'cancelled';
  plan_id: string | null; actual_destination: string | null; completed_at: string | null;
}
export interface CompanyItinerary {
  id: string; company_id: string | null; pilot_id: string | null; aircraft_id: string | null; flight_number: string;
  nature_transport: 'passagers' | 'cargo'; origin: string; destination: string; status: ItineraryStatus;
  next_leg_index: number; created_at: string; updated_at: string; completed_at: string | null;
  legs: ItineraryLeg[];
}
