export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  /** Présents uniquement pour une session admin (GET staff). Absents du listage public. */
  announce_discord?: boolean;
  announce_channel_id?: string | null;
  announce_role_id?: string | null;
  announced_at?: string | null;
  /** Rempli uniquement après envoi réel au début UTC (cron). Jamais à la création. */
  announce_sent_at?: string | null;
  created_by?: string | null;
  created_via?: 'site' | 'discord';
  created_at: string;
};

export type CalendarEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at?: string | null;
  announce_discord?: boolean;
  announce_channel_id?: string | null;
  announce_role_id?: string | null;
};

export type DiscordCalendarTarget = {
  id: string;
  name: string;
};

export const CALENDAR_EVENT_SELECT =
  'id, title, description, location, starts_at, ends_at, announce_discord, announce_channel_id, announce_role_id, announced_at, announce_sent_at, created_by, created_via, created_at';

export const WEBSTAFF_HINT =
  'Tu dois être administrateur sur le site internet. Possible de postuler via le formulaire Webstaff (AeroSchool). Pour plus d’informations, contacte MrPolochon.';
