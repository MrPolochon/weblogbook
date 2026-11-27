export type CpdlcKind = 'CLEARANCE' | 'FREE_TEXT' | 'ATIS' | 'WX' | 'RESPONSE' | 'SYSTEM';
export type CpdlcStatus = 'SENT' | 'STANDBY' | 'CLEAR' | 'REFUSED' | 'WILCO' | 'UNABLE' | 'ROGER' | 'TIMED_OUT';
export type CpdlcMessage = {
  id: string; created_at: string; from_station: string; to_station: string;
  kind: CpdlcKind; body: string; status: CpdlcStatus; reply_to: string | null;
  plan_id: string | null; recipient_plan_id: string | null;
  sender_user_id: string | null; recipient_user_ids: string[];
  assigned_session_id: string | null; deadline_at: string | null;
  response_required: boolean; late: boolean; payload: Record<string, unknown>;
  /** Computed for this viewer. ACK never implies WILCO or any operational change. */
  incoming: boolean; acknowledged: boolean;
};
export type CpdlcStation = { session_id: string; code: string; position: string; started_at: string; user_id: string };
export type CpdlcInbox = {
  available: boolean; mode: 'pilot' | 'atc'; user_id: string;
  station: string | null; plan_id: string | null; messages: CpdlcMessage[];
  stations: CpdlcStation[]; error?: string;
};
export type CpdlcInit = { flight_no: string; dep: string; dest: string; altn: string; ete: string; utc: string; date: string; gate?: string; atis_id?: string; aircraft_type?: string; station?: string; text?: string };
export type CpdlcCommand =
  | { action: 'clearance'; plan_id: string; init: CpdlcInit; client_request_id: string }
  | { action: 'free_text'; plan_id?: string; flight_no?: string; to: string; text: string; client_request_id: string }
  | { action: 'atis'; plan_id: string; flight_no: string; airport: string; client_request_id: string }
  | { action: 'weather'; plan_id: string; flight_no: string; airports: string[]; wx_type: 'METAR' | 'TAF'; client_request_id: string }
  | { action: 'ack'; message_id: string; plan_id?: string }
  | { action: 'respond'; message_id: string; plan_id?: string; response: 'CLEAR' | 'REFUSED' | 'WILCO' | 'UNABLE' | 'STANDBY' | 'ROGER' | 'FREE_TEXT'; clearance?: { destination: string; departure: string; altitude: string; squawk: string; frequency: string; text?: string }; text?: string; client_request_id: string }
  | { action: 'transfer'; message_id: string; session_id: string; client_request_id: string };

// GET /api/cpdlc?plan_id=<uuid> for pilots, GET /api/cpdlc for active ATC.
// POST /api/cpdlc accepts CpdlcCommand, returns { ok:true, message_id?:string }.
// Poll GET every 3 seconds; incoming && !acknowledged triggers ONE shared alert loop.
// Network failures must retain the last inbox; 503 = migration/provider unavailable.
