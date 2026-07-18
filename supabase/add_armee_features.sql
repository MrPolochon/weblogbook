-- Fonctionnalités armée : briefing, AAR, bonus streak (idempotent)

-- Briefing opérationnel (singleton)
CREATE TABLE IF NOT EXISTS public.armee_briefing (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  titre TEXT NOT NULL DEFAULT 'Briefing opérationnel',
  contenu TEXT NOT NULL DEFAULT '',
  actif BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.armee_briefing (id, titre, contenu, actif)
VALUES (1, 'Briefing opérationnel', '', false)
ON CONFLICT (id) DO NOTHING;

-- Rapport après action (AAR) sur vols mission
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS mission_aar_notes TEXT,
  ADD COLUMN IF NOT EXISTS mission_aar_tags TEXT[],
  ADD COLUMN IF NOT EXISTS mission_streak_days INTEGER,
  ADD COLUMN IF NOT EXISTS mission_streak_bonus INTEGER;

-- Traçabilité bonus streak dans l'historique
ALTER TABLE public.armee_missions_log
  ADD COLUMN IF NOT EXISTS streak_bonus INTEGER NOT NULL DEFAULT 0;

COMMENT ON TABLE public.armee_briefing IS
  'Briefing opérationnel affiché dans l''espace militaire (ligne unique id=1).';

COMMENT ON COLUMN public.vols.mission_aar_notes IS
  'Notes du rapport après action (AAR) déposé par le pilote.';

COMMENT ON COLUMN public.vols.mission_aar_tags IS
  'Tags AAR : objectif_atteint, dommages, incident, extraction_reussie, retard_meteo, etc.';

-- RLS : accès serveur uniquement (comme armee_missions_log)
ALTER TABLE public.armee_briefing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS armee_briefing_no_client ON public.armee_briefing;
CREATE POLICY armee_briefing_no_client ON public.armee_briefing
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
