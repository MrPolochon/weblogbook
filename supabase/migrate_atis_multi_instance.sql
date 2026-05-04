-- =============================================================================
-- Migration : passage à plusieurs instances de bot ATIS (multi-bot)
-- =============================================================================
-- Avant : une seule ligne 'default' dans atis_broadcast_state et atis_broadcast_config.
-- Après : une ligne par instance Discord (id = '1', '2', ...).
--
-- Cette migration est idempotente : on peut la rejouer sans dommage.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. atis_broadcast_state : renommer 'default' en '1', créer '2'
-- ---------------------------------------------------------------------------

-- Renomme la ligne historique 'default' en '1' (instance principale)
UPDATE public.atis_broadcast_state
SET id = '1'
WHERE id = 'default';

-- Crée la ligne pour l'instance 2 si absente
INSERT INTO public.atis_broadcast_state (id, broadcasting)
VALUES ('2', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. atis_broadcast_config : idem
-- ---------------------------------------------------------------------------

UPDATE public.atis_broadcast_config
SET id = '1'
WHERE id = 'default';

INSERT INTO public.atis_broadcast_config (id)
VALUES ('2')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Contrainte applicative : un même aéroport ne peut être broadcast que par
--    une seule instance à la fois. On utilise un index unique partiel.
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.atis_broadcast_state_aeroport_unique;
CREATE UNIQUE INDEX atis_broadcast_state_aeroport_unique
ON public.atis_broadcast_state (aeroport)
WHERE broadcasting = true AND aeroport IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Index pour retrouver vite l'instance contrôlée par un user
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS atis_broadcast_state_controlling_user_id_idx
ON public.atis_broadcast_state (controlling_user_id)
WHERE controlling_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Mise à jour des commentaires
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.atis_broadcast_state IS
  'Etat du broadcast ATIS Discord. Une ligne par instance de bot (id = ''1'', ''2'', ...).';
COMMENT ON TABLE public.atis_broadcast_config IS
  'Config Discord ATIS par instance : guild + canal vocal. Une ligne par instance.';

COMMIT;

-- =============================================================================
-- Vérification post-migration (à exécuter séparément si besoin)
-- =============================================================================
-- SELECT id, broadcasting, aeroport, controlling_user_id FROM public.atis_broadcast_state ORDER BY id;
-- SELECT id, discord_guild_name, discord_channel_name FROM public.atis_broadcast_config ORDER BY id;
