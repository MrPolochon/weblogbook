-- ============================================================
--  Calendrier communautaire (événements coordonnés, UTC)
-- ============================================================
-- starts_at / ends_at sont des timestamptz : toujours stockés en UTC.
-- Affichage : UTC d’abord (19H UTC), heure locale de l’appareil entre parenthèses (7h Local).
-- Le groupe du mois (grilles) utilise le jour UTC de starts_at.

CREATE TABLE IF NOT EXISTS public.site_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  announce_discord BOOLEAN NOT NULL DEFAULT false,
  announce_channel_id TEXT,
  announce_role_id TEXT,
  announced_at TIMESTAMPTZ,
  announce_sent_at TIMESTAMPTZ,
  announce_message_id TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_via TEXT NOT NULL DEFAULT 'site' CHECK (created_via IN ('site', 'discord')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_event_end_after_start CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_site_calendar_starts ON public.site_calendar_events (starts_at);
CREATE INDEX IF NOT EXISTS idx_site_calendar_created ON public.site_calendar_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_calendar_announce_due
  ON public.site_calendar_events (starts_at)
  WHERE announce_channel_id IS NOT NULL AND announce_sent_at IS NULL;

ALTER TABLE public.site_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_calendar_select_all" ON public.site_calendar_events;
CREATE POLICY "site_calendar_select_all"
  ON public.site_calendar_events FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "site_calendar_admin_write" ON public.site_calendar_events;
CREATE POLICY "site_calendar_admin_write"
  ON public.site_calendar_events FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

GRANT SELECT ON public.site_calendar_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_calendar_events TO authenticated, service_role;
