import { createAdminClient } from '@/lib/supabase/admin';
import { FlightSubmissionError, submissionError } from '@/lib/plans-vol/submission';
import { isCompanyMember } from '@/lib/plans-vol/crew';
import type { CompanyItinerary, ItineraryLeg } from './types';

const fields = 'id,company_id,pilot_id,aircraft_id,flight_number,nature_transport,origin,destination,status,next_leg_index,created_at,updated_at,completed_at';
const legFields = 'id,itinerary_id,leg_index,origin,destination,preparation,status,plan_id,actual_destination,completed_at';
export async function companyItineraries(actor: string, company: string) {
  const admin = createAdminClient();
  if (!await isCompanyMember(admin, actor, company)) throw new FlightSubmissionError('Vous n’appartenez pas à cette compagnie.', 403);
  const [unlock, rows] = await Promise.all([
    admin.rpc('company_development_has_unlock', { p_company: company, p_key: 'correspondance' }),
    admin.from('company_itineraries').select(fields).eq('company_id', company).order('created_at', { ascending: false }).limit(100),
  ]);
  if (unlock.error || rows.error) throw submissionError(unlock.error || rows.error);
  const itineraries = (rows.data || []) as Omit<CompanyItinerary, 'legs'>[];
  let legs: ItineraryLeg[] = [];
  if (itineraries.length) {
    const result = await admin.from('company_itinerary_legs').select(legFields).in('itinerary_id', itineraries.map(it => it.id)).order('leg_index');
    if (result.error) throw submissionError(result.error);
    legs = (result.data || []) as ItineraryLeg[];
  }
  return { current_user_id: actor, unlocked: Boolean(unlock.data), itineraries: itineraries.map(itinerary => ({ ...itinerary,
    can_resume: itinerary.pilot_id === actor && ['planned', 'paused'].includes(itinerary.status),
    can_cancel: itinerary.pilot_id === actor && ['planned', 'paused', 'diverted'].includes(itinerary.status),
    legs: legs.filter(leg => leg.itinerary_id === itinerary.id) })) };
}
export async function itineraryDetail(actor: string, id: string) {
  const admin = createAdminClient();
  const row = await admin.from('company_itineraries').select(fields).eq('id', id).maybeSingle();
  if (row.error) throw submissionError(row.error);
  if (!row.data) throw new FlightSubmissionError('Itinéraire introuvable.', 404);
  const itinerary = row.data as Omit<CompanyItinerary, 'legs'>;
  // The assigned pilot can still cancel the remaining route after leaving a company.
  if (itinerary.pilot_id !== actor && (!itinerary.company_id || !await isCompanyMember(admin, actor, itinerary.company_id))) throw new FlightSubmissionError('Itinéraire inaccessible.', 403);
  const result = await admin.from('company_itinerary_legs').select(legFields).eq('itinerary_id', id).order('leg_index');
  if (result.error) throw submissionError(result.error);
  const legs = (result.data || []) as ItineraryLeg[];
  return { current_user_id: actor, itinerary: { ...itinerary, legs,
    can_resume: itinerary.pilot_id === actor && ['planned', 'paused'].includes(itinerary.status),
    can_cancel: itinerary.pilot_id === actor && ['planned', 'paused', 'diverted'].includes(itinerary.status),
  }, legs, next_leg: legs.find(leg => leg.leg_index === itinerary.next_leg_index && leg.status === 'planned') || null, current_plan_id: legs.find(leg => leg.status === 'active')?.plan_id || null };
}
