-- ============================================================
-- Avis d'inactivite (avant suppression automatique du compte)
-- ============================================================
-- Cycle de vie :
--   inactif (>30j sans connexion)
--     -> [Admin lance "Avertir"]
--        - DM Discord OK   -> status='warned'  + delete_after = now + 14j
--        - DM Discord FAIL -> status='dm_failed' + error = motif
--   user se reconnecte avant delete_after
--     -> reset complet des colonnes inactivity_*
--   delete_after passe et toujours pas reconnecte
--     -> cron auto-delete (deleteUserAccount)
--   status='dm_failed'
--     -> admin doit supprimer manuellement
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inactivity_warned_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS inactivity_warning_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS inactivity_warning_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS inactivity_delete_after TIMESTAMPTZ NULL;

-- CHECK contrainte sur le statut (idempotent : drop puis re-add)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_inactivity_warning_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_inactivity_warning_status_check
  CHECK (inactivity_warning_status IS NULL OR inactivity_warning_status IN ('warned', 'dm_failed'));

CREATE INDEX IF NOT EXISTS idx_profiles_inactivity_delete_after
  ON public.profiles(inactivity_delete_after)
  WHERE inactivity_delete_after IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_inactivity_warning_status
  ON public.profiles(inactivity_warning_status)
  WHERE inactivity_warning_status IS NOT NULL;

COMMENT ON COLUMN public.profiles.inactivity_warned_at IS
  'Date d''envoi du DM Discord d''avertissement d''inactivite (NULL si jamais averti ou si reset).';
COMMENT ON COLUMN public.profiles.inactivity_warning_status IS
  '''warned'' = DM envoye, suppression auto programmee. ''dm_failed'' = DM echoue, suppression manuelle requise par admin.';
COMMENT ON COLUMN public.profiles.inactivity_warning_error IS
  'Raison de l''echec du DM (ex: "Aucun compte Discord lie", "Bot indisponible").';
COMMENT ON COLUMN public.profiles.inactivity_delete_after IS
  'Date a partir de laquelle le cron supprimera le compte si l''utilisateur ne s''est pas reconnecte. Generalement now() + 14 jours.';

NOTIFY pgrst, 'reload schema';
