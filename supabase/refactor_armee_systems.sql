-- Refonte systèmes armée (idempotent)
-- - Index cooldown par utilisateur (missions_log)
-- - Index vols militaires / mission
-- - Commentaires documentaires

-- Cooldown & historique missions : lookup (mission_id, user_id) ordonné par date
CREATE INDEX IF NOT EXISTS idx_armee_missions_log_mission_user_created
  ON public.armee_missions_log (mission_id, user_id, created_at DESC);

-- Lookup global historique (audit / admin)
CREATE INDEX IF NOT EXISTS idx_armee_missions_log_mission_created
  ON public.armee_missions_log (mission_id, created_at DESC);

-- Vols militaires liés à une mission
CREATE INDEX IF NOT EXISTS idx_vols_mission_id
  ON public.vols (mission_id)
  WHERE mission_id IS NOT NULL;

-- Flotte armée active
CREATE INDEX IF NOT EXISTS idx_armee_avions_actifs
  ON public.armee_avions (created_at DESC)
  WHERE detruit = false;

COMMENT ON TABLE public.armee_missions_log IS
  'Historique des missions militaires validées. Utilisé pour le cooldown par utilisateur (mission_id + user_id).';

COMMENT ON COLUMN public.vols.mission_status IS
  'Statut mission: en_attente | valide | echec (après MISSION_MAX_REFUSALS refus).';
