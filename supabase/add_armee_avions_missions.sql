-- Armée: inventaire avions + missions revenus
-- Exécuter dans l'éditeur SQL Supabase

-- Table des avions possédés par l'armée
CREATE TABLE IF NOT EXISTS public.armee_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_avion_id UUID NOT NULL REFERENCES public.types_avion(id) ON DELETE RESTRICT,
  nom_personnalise TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_armee_avions_type ON public.armee_avions(type_avion_id);

-- Lien optionnel sur vols militaires
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS armee_avion_id UUID REFERENCES public.armee_avions(id) ON DELETE SET NULL;

-- Champs mission (pour rémunération militaire)
ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS mission_id TEXT,
  ADD COLUMN IF NOT EXISTS mission_titre TEXT,
  ADD COLUMN IF NOT EXISTS mission_reward_base INTEGER,
  ADD COLUMN IF NOT EXISTS mission_reward_final INTEGER,
  ADD COLUMN IF NOT EXISTS mission_delay_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS mission_status TEXT,
  ADD COLUMN IF NOT EXISTS mission_refusals INTEGER NOT NULL DEFAULT 0;

-- Historique des missions militaires (pour cooldown et audit)
CREATE TABLE IF NOT EXISTS public.armee_missions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_armee_missions_log_user ON public.armee_missions_log(user_id, created_at DESC);
