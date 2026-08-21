-- Bot assistance Discord (tickets) — config + tickets + logs site

CREATE TABLE IF NOT EXISTS public.support_bot_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  guild_id TEXT,
  panel_channel_id TEXT,
  panel_message_id TEXT,
  logs_channel_id TEXT,
  staff_role_id TEXT,
  category_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.support_bot_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT,
  channel_id TEXT NOT NULL UNIQUE,
  motif TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'ia',
  reason_text TEXT,
  conversation jsonb NOT NULL DEFAULT '[]'::jsonb,
  memory_notes text,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  transcript TEXT,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_human_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_nudge_at TIMESTAMPTZ,
  inactivity_nudge integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_open_user
  ON public.support_tickets (discord_user_id)
  WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON public.support_tickets (created_at DESC);

ALTER TABLE public.support_bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_bot_config_no_client" ON public.support_bot_config;
CREATE POLICY "support_bot_config_no_client" ON public.support_bot_config
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "support_tickets_no_client" ON public.support_tickets;
CREATE POLICY "support_tickets_no_client" ON public.support_tickets
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.support_tickets IS 'Tickets Discord assistance — transcripts conservés après suppression du salon.';
