-- Annonce Discord au début de l’événement (pas à la création).
-- announce_sent_at : envoyée une seule fois, idempotent pour le cron.

ALTER TABLE public.site_calendar_events
  ADD COLUMN IF NOT EXISTS announce_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.site_calendar_events.announce_sent_at IS
  'Horodatage UTC de l annonce Discord envoyee au debut de l evenement.';

CREATE INDEX IF NOT EXISTS idx_site_calendar_announce_due
  ON public.site_calendar_events (starts_at)
  WHERE announce_channel_id IS NOT NULL AND announce_sent_at IS NULL;
