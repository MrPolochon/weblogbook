-- =============================================================================
-- Système de notifications in-app
-- =============================================================================
-- Notifications courtes avec lien vers une page (différentes des `messages`
-- qui sont conversationnelles). Affichées dans la cloche en navbar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- L'utilisateur ne peut voir QUE ses propres notifications.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- L'utilisateur peut marquer ses notifications comme lues (UPDATE de read_at uniquement).
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- L'utilisateur peut supprimer ses propres notifications (clean inbox).
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Aucune policy INSERT pour les utilisateurs : les notifs sont créées
-- uniquement via les routes API (service_role).

COMMENT ON TABLE public.notifications IS
  'Notifications in-app (cloche navbar). Crees par les routes API service_role uniquement.';
COMMENT ON COLUMN public.notifications.type IS
  'Type technique pour categorisation : exam_request, exam_accepted, module_validated, transfer, etc.';
COMMENT ON COLUMN public.notifications.link IS
  'URL relative interne (par ex. /instruction?tab=mes-eleves) pour rediriger au clic.';
COMMENT ON COLUMN public.notifications.read_at IS
  'Date de lecture par l''utilisateur. NULL = non lue.';
