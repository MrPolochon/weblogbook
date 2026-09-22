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

export const WEBSTAFF_HINT =
  'Tu dois être administrateur sur le site internet. Possible de postuler via le formulaire Webstaff (AeroSchool). Pour plus d’informations, contacte MrPolochon.';
