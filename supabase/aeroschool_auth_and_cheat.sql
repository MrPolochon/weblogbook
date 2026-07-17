-- AeroSchool : accès authentifié, identité répondant, raison de triche
-- Exécuter manuellement dans Supabase SQL Editor si les colonnes n'existent pas encore.

-- Formulaire réservé aux utilisateurs connectés (false = public)
ALTER TABLE public.aeroschool_forms
  ADD COLUMN IF NOT EXISTS requires_auth BOOLEAN NOT NULL DEFAULT false;

-- Lien vers le profil du répondant (NULL pour soumissions anonymes publiques)
ALTER TABLE public.aeroschool_responses
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Identifiant affiché au moment de la soumission (snapshot)
ALTER TABLE public.aeroschool_responses
  ADD COLUMN IF NOT EXISTS respondent_identifiant TEXT;

-- Raison détaillée de la détection anti-triche
ALTER TABLE public.aeroschool_responses
  ADD COLUMN IF NOT EXISTS cheat_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_aeroschool_responses_user
  ON public.aeroschool_responses(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aeroschool_forms_requires_auth
  ON public.aeroschool_forms(requires_auth)
  WHERE requires_auth = true;
