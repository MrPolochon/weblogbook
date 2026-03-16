-- État du broadcast ATIS (contrôlé depuis l'espace ATC weblogbook)
-- Un seul ATC peut contrôler le bot à la fois. Une seule ligne (id='default').

CREATE TABLE IF NOT EXISTS public.atis_broadcast_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  controlling_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  aeroport TEXT,
  position TEXT,
  broadcasting BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.atis_broadcast_state (id, broadcasting) VALUES ('default', false)
ON CONFLICT (id) DO NOTHING;

-- Préférence ticker ATIS par utilisateur (affichage du texte défilant)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS atis_ticker_visible BOOLEAN DEFAULT true;
-- Mode automatique : rotation du code ATIS quand obsolète (1h)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS atis_code_auto_rotate BOOLEAN DEFAULT false;

-- Config Discord (serveur + canal vocal) - sélectionnable dans le panneau ATIS
CREATE TABLE IF NOT EXISTS public.atis_broadcast_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  discord_guild_id TEXT,
  discord_guild_name TEXT,
  discord_channel_id TEXT,
  discord_channel_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.atis_broadcast_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.atis_broadcast_state IS 'État du broadcast ATIS Discord : qui contrôle, si actif. Une seule ligne.';
COMMENT ON TABLE public.atis_broadcast_config IS 'Config Discord ATIS : serveur et canal vocal sélectionnés dans le panneau.';
COMMENT ON COLUMN public.profiles.atis_ticker_visible IS 'Afficher le ticker ATIS sous la navbar (texte défilant)';
COMMENT ON COLUMN public.profiles.atis_code_auto_rotate IS 'Rotation automatique du code ATIS (A→B→…) quand obsolète (1h)';
