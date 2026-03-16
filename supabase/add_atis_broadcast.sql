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

COMMENT ON TABLE public.atis_broadcast_state IS 'État du broadcast ATIS Discord : qui contrôle, si actif. Une seule ligne.';
COMMENT ON COLUMN public.profiles.atis_ticker_visible IS 'Afficher le ticker ATIS sous la navbar (texte défilant)';
