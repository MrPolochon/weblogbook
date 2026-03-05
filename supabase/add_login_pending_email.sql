-- ============================================================
-- Email en attente : l'email n'est enregistré qu'après vérification du code
-- Quand l'utilisateur n'a pas d'email, il le saisit → envoi du code → après vérification du code, l'email est ajouté au profil
-- ============================================================

ALTER TABLE public.login_verification_codes
  ADD COLUMN IF NOT EXISTS pending_email TEXT;

COMMENT ON COLUMN public.login_verification_codes.pending_email IS 'Email saisi par l''utilisateur (sans profil email) ; enregistré dans profiles après validation du code';
