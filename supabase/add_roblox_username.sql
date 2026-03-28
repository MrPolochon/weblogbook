-- Ajout du champ roblox_username aux profils
-- Permet aux utilisateurs de lier leur pseudo Roblox pour identification radar

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roblox_username TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_roblox_username
  ON public.profiles(roblox_username)
  WHERE roblox_username IS NOT NULL;

-- RLS : l'utilisateur peut lire/modifier son propre roblox_username
-- (les policies existantes sur profiles couvrent déjà cela)
