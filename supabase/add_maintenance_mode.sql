-- ============================================================
-- TABLE : app_maintenance (singleton id=1)
-- Mode maintenance global : bloque tous les accès non-admin
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_maintenance (
  id                  INT          PRIMARY KEY DEFAULT 1,
  active              BOOLEAN      NOT NULL DEFAULT false,
  message             TEXT         DEFAULT 'Le site est en cours de mise à jour. Veuillez patienter.',
  maintenance_until   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  DEFAULT now()
);

-- Row singleton
INSERT INTO public.app_maintenance (id, active, message, maintenance_until)
VALUES (1, false, 'Mise à jour en cours...', null)
ON CONFLICT (id) DO NOTHING;

-- RLS : seuls les admins (service_role) peuvent modifier
ALTER TABLE public.app_maintenance ENABLE ROW LEVEL SECURITY;

-- La lecture est autorisée pour tout le monde (le middleware lit en service_role de toute façon)
CREATE POLICY "maintenance_read_all"
  ON public.app_maintenance FOR SELECT
  USING (true);

-- Seul le service_role peut écrire (le middleware utilise le client admin)
-- Les INSERT/UPDATE/DELETE via anon/authenticated sont bloqués par défaut.

-- ============================================================
-- ACTIVER la maintenance pour N minutes (exemple : 7 minutes)
-- ============================================================
-- UPDATE public.app_maintenance
-- SET active = true,
--     message = 'Le site est en cours de mise à jour majeure (Juillet 2026). Reconnexion possible à 18h25. Merci de votre patience !',
--     maintenance_until = NOW() + INTERVAL '7 minutes'
-- WHERE id = 1;

-- ============================================================
-- DÉSACTIVER la maintenance
-- ============================================================
-- UPDATE public.app_maintenance SET active = false WHERE id = 1;
